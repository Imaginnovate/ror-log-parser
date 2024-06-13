const _ = require("lodash");
const moment = require("moment");
const excel = require('write-excel-file/node');
const logger = require('node-color-log');
const commander = require('commander');
const fs = require('fs');
const readline = require('readline');
const singleLineLog = require('single-line-log').stdout;


main();

function main()
{
    commander
        .version('1.0.0', '-v, --version')
        .usage('[OPTIONS]...')
        .option('-i, --input <value>', 'Input CSV file name')
        .option('-o, --output <value>', 'Optional output file name')
        .option('-p, --params', 'Include parameters')
        .parse(process.argv);


    const options = commander.opts();
    const inputFile = options.input;
    if (!inputFile) {
        logger.color('red').log('Please enter input file using -i option');
        return false;
    }
    logger.color('green').reverse().log('This script will parse ROR application log...');
    logger.log('Started at ' + new Date());

    const data = [];
    const summary = [];
    let lineCount = 0;

    const lineReader = readline.createInterface({
        input: fs.createReadStream(inputFile)
    });

    lineReader.on('line', function (line) {
        if (_.includes(line, '-- :')) {
            const parsed = parseLine(line);
            let index = -1
            switch (parsed.type) {
                case 'Started':
                    data.push({
                        id: parsed.id,
                        method: parsed.method,
                        url: parsed.url,
                        queryParams: parsed.queryParams,
                        ip: parsed.ip,
                        dateTime: parsed.dateTime,
                        params: '',
                        code: 0,
                        ms: 0,
                    })
                    break;
                case 'Parameters':
                    index = _.findIndex(data, [ 'id' , parsed.id]);
                    if (index == -1 || !options.params) {
                        break;
                    }
                    data[index].params = parsed.params;
                    break;
                case 'Completed':
                    index = _.findIndex(data, [ 'id' , parsed.id]);
                    if (index == -1) {
                        break;
                    }
                    data[index].code = parsed.code;
                    data[index].ms = parsed.ms;

                    const summaryIndex = _.findIndex(summary, [ 'url' , data[index].url]);
                    if (summaryIndex == -1) {
                        summary.push({
                            url: data[index].url,
                            count: 1,
                            minimum: parsed.ms,
                            maximum: parsed.ms,
                        })
                    } else {
                        summary[summaryIndex].count += 1;
                        if (summary[summaryIndex].minimum > parsed.ms ) {
                            summary[summaryIndex].minimum = parsed.ms;
                        }
                        if (summary[summaryIndex].maximum < parsed.ms ) {
                            summary[summaryIndex].maximum = parsed.ms;
                        }
                    }

                    //console.log(data[index]);
                    break;
            }
            lineCount += 1;
            singleLineLog('Lines Parsed ' + lineCount);

        }
    });

    lineReader.on('close', function () {
        logger.log('');
        logger.color('green').reverse().log('Log parsing done...');
        logger.color('green').reverse().log('Creating excel file...');

        const sheetData = []
        const sheetNames = ['Summary', 'Detailed']
        const outputFile = options.output || 'ror_log.xlsx';
        sheetData.push(data);
        excel([summary].concat(sheetData), {
            schema: getSchemaArray(),
            sheets: sheetNames,
            stickyRowsCount: 1,
            filePath: outputFile,
        })

        logger.log('');
        logger.log('Completed at ' + new Date());
        logger.color('green').reverse().log(`Excel file created: ${outputFile}`);
    });


}

function parseLine(line) {
    const temp = _.split(line, '-- : ')
    if (temp.length < 2) {
        return inValidObject();
    }

    const data = temp[1];
    if (_.includes(data, '] Started')) {
        return startedObject(data);
    }

    if (_.includes(data, ']   Parameters:')) {
        return parameterObject(data);
    }

    if (_.includes(data, '] Completed')) {
        return completedObject(data);
    }

    return inValidObject();
}

function startedObject(line) {
    const id = findId(line);
    if (id == '') {
        return inValidObject();
    }
    const temp = _.split(line, ' ');
    if (temp.length < 10) {
        return inValidObject();
        logger.color('red').log('Invalid Started Line: ' + line);
    }
    const fullUrl = temp[3].replace(/"/g, ''); // _.replace(temp[3], '"', '');
    const splitUrl = _.split(fullUrl, '?');
    const url = splitUrl[0];
    let queryParams = '';
    if (splitUrl.length > 1) {
        queryParams = splitUrl[1];
    }
    return {
        type: 'Started',
        id: id,
        method: temp[2],
        url: url,
        queryParams: queryParams,
        ip: temp [5],
        dateTime: temp [7] + ' ' + temp[8],
    }
}

function parameterObject(line) {
    const id = findId(line);
    if (id == '') {
        return inValidObject();
    }
    const index = _.indexOf(line, ':');
    const value = line.slice(index + 2, line.length);
    return {
        type: 'Parameters',
        id : id,
        params: value,
    }
}

function completedObject(line) {
    const id = findId(line);
    if (id == '') {
        return inValidObject();
    }
    const temp = _.split(line, ' ');
    if (temp.length < 6) {
        return inValidObject();
        logger.color('red').log('Invalid Completed Line: ' + line);
    }
    return {
        type: 'Completed',
        id: id,
        code: _.toNumber(temp[2]),
        ms: _.toNumber(_.replace(temp[5], 'ms', '')),
    }
}

function inValidObject() {
    return {
        type: 'Invalid',
    }
}

function findId(line) {
    const temp = _.split(line, ']');
    if (temp.length < 2) {
        return '';
    }
    const id = _.replace(temp[0], '[', '');
    if (_.size(id) == 36) {
        return id;
    }
    return '';
}

function getSchemaArray() {
    const schema = [

        {
            column: 'Method',
            type: String,
            value: data => _.get(data, 'method'),
            width: 8,
        },
        {
            column: 'EndPoint',
            type: String,
            value: data => _.get(data, 'url'),
            width: 50,
        },
        {
            column: 'Params',
            type: String,
            value: data => _.get(data, 'queryParams'),
            width: 30,
        },
        {
            column: 'Response',
            type: Number,
            value: data => _.get(data, 'code'),
            format: '0',
            width: 10,
        },
        {
            column: 'MilliSeconds',
            type: Number,
            value: data => _.get(data, 'ms'),
            format: '0',
            width: 10,
        },
        {
            column: 'Date Time',
            type: String,
            value: data => _.get(data, 'dateTime'),
            width: 20,
        },
        {
            column: 'Id',
            type: String,
            value: data => _.get(data, 'id'),
            width: 20,
        },
    ];

    const summarySchema = [
        {
            column: 'EndPoint',
            type: String,
            value: data => _.get(data, 'url'),
            width: 50,
        },
        {
            column: 'Count',
            type: Number,
            value: data => _.get(data, 'count'),
            format: '#',
            width: 10,
        },
        {
            column: 'Minimum',
            type: Number,
            value: data => _.get(data, 'minimum'),
            format: '#',
            width: 10,
        },
        {
            column: 'Maximum',
            type: Number,
            value: data => _.get(data, 'maximum'),
            format: '#',
            width: 10,
        },
    ]

    return [summarySchema, schema];
}
