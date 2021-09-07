import * as  config from '../../util/conf';
import { ok, error } from "../../util/http";
import sinon from 'sinon';
import * as handlerInstance from '../../handlers/posHandler';
import { DynamoDB, Credentials } from "aws-sdk";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import * as conf from '../../util/conf'
import * as testData from '../data/posTestData'
import * as awsDynamodb from "../../aws/dynamodb";
import * as PosOrderDetails from '../../storage/posOrderDetails'
import * as PosOrdersByItemDetails from '../../storage/posOrdersByItemDetails'
import * as PosOrdersByAssociate from '../../storage/posOrdersByAssociate'
import * as PosOrdersByCustomer from '../../storage/posOrdersByCustomer'

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
    const posOrderDetailsStub = sinon.stub(PosOrderDetails, 'put').resolves(testData.posOrderDetails);
    const posOrdersByItemDetailsStub = sinon.stub(PosOrdersByItemDetails, 'batchWrite').resolves(testData.posItemDetails);
    const posFetchAssociatePinsStub = sinon.stub(PosOrdersByItemDetails, 'fetchAssociatePins').resolves(testData.fetchAssociatePins);
    const posOrdersByAssociateStub = sinon.stub(PosOrdersByAssociate, 'batchWrite').resolves(testData.posAssociateOrder);
    const posOrdersByCustomerStub = sinon.stub(PosOrdersByCustomer, 'put').resolves(testData.posCustomerOrder);


    afterAll(() => {
        ddbMapperStub.reset();
        posOrderDetailsStub.reset();
        posOrdersByItemDetailsStub.reset();
        posFetchAssociatePinsStub.reset();
        posOrdersByAssociateStub.reset();
        posOrdersByCustomerStub.reset();
    });

    test('Test readKinesisStream', async () => {
        console.log(`Test readKinesisStream`)
        let kinesisPayload = testData.kinesisStreamEvent;
        await handlerInstance.readPosKinesisStream(kinesisPayload);
    });

    test('Test readKinesisStream for postvoid order', async () => {
        console.log(`Test readKinesisStream for postvoid order`)
        let kinesisPayload = testData.kinesisStreamEvent_Postvoid;
        await handlerInstance.readPosKinesisStream(kinesisPayload);
    });

    test('Test Return Order readKinesisStream', async () => {
        console.log(`Test Return Order readKinesisStream`)
        let kinesisPayload = testData.kinesisStreamEvent_Return;
        await handlerInstance.readPosKinesisStream(kinesisPayload);
    });

})