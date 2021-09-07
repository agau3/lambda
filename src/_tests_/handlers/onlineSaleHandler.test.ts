import * as  config from '../../util/conf';
import { ok, error } from "../../util/http";
import sinon from 'sinon';
import * as handlerInstance from '../../handlers/onlineSaleHandler';
import { DynamoDB, Credentials } from "aws-sdk";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import * as conf from '../../util/conf'
import * as onlineSaleTestData from '../data/onlineSaleTestData'
import * as awsDynamodb from "../../aws/dynamodb";
import * as AssociateOnlineSale from '../../storage/onlineSaleAction';

var AWS = require('aws-sdk');

AWS.config.update({
    region: 'us-east-2',
    credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
        sessionToken: "test"
    }
});

const mapper = new DataMapper({ client: new DynamoDB() });

describe('api handler test', () => {
    const ddbMapperStub = sinon.stub(awsDynamodb, 'dynamodbMapper').resolves(mapper);
    const onlineSalesActionDetailsStub = sinon.stub(AssociateOnlineSale, 'batchWrite').resolves(onlineSaleTestData.onlineSalesActionList);


    afterAll(() => {
        ddbMapperStub.reset();
        onlineSalesActionDetailsStub.reset();
    });

    test('Test readKinesisStream', async () => {
        let kinesisPayload = onlineSaleTestData.kinesisStreamEvent;
        await handlerInstance.readCmosKinesisStream(kinesisPayload);
    });

})