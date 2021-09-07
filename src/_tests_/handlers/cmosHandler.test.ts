import * as  config from '../../util/conf';
import { ok, error } from "../../util/http";
import sinon from 'sinon';
import * as handlerInstance from '../../handlers/cmosHandler';
import { DynamoDB, Credentials } from "aws-sdk";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import * as conf from '../../util/conf'
import * as testData from '../data/cmosTestData'
import * as posTestData from '../data/posTestData'
import * as awsDynamodb from "../../aws/dynamodb";
import * as CmosOrderDetails from '../../storage/cmosOrderDetails';
import * as CmosItemDetails from '../../storage/cmosItemDetails';
import * as CmosAssociateOrder from '../../storage/cmosOrdersByStylist';
import * as CmosCustomerOrder from '../../storage/cmosOrdersByCustomer';
import * as posOrderDetails from '../../storage/posOrderDetails';

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
    const cmosOrderDetailsStub = sinon.stub(CmosOrderDetails, 'put').resolves(testData.cmosOrderDetails);
    const cmosOrdersByItemDetailsStub = sinon.stub(CmosItemDetails, 'batchWrite').resolves(testData.cmosItemDetails);
    const cmosOrdersByAssociateStub = sinon.stub(CmosAssociateOrder, 'put').resolves(testData.cmosAssociateOrder);
    const cmosOrdersByCustomerStub = sinon.stub(CmosCustomerOrder, 'put').resolves(testData.cmosCustomerOrder);
    const posOrderDetailsStub = sinon.stub(posOrderDetails, 'update').resolves(posTestData.posOrderDetails);

    afterAll(() => {
        ddbMapperStub.reset();
        cmosOrderDetailsStub.reset();
        cmosOrdersByItemDetailsStub.reset();
        cmosOrdersByAssociateStub.reset();
        cmosOrdersByCustomerStub.reset();
        posOrderDetailsStub.reset();
    });

    test('Test readKinesisStream', async () => {
        let kinesisPayload = testData.kinesisStreamEvent;
        await handlerInstance.readCmosKinesisStream(kinesisPayload);
    });

})