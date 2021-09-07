import logger from '@nmg/osp-backend-utils/logger';
import * as awsDynamodb from "../aws/dynamodb";
import { CmosOrder } from '../dto/cmosOrder';
import * as orderDetails from '../storage/cmosOrderDetails';
import * as posOrderDetails from '../storage/posOrderDetails';
import * as itemDetails from '../storage/cmosItemDetails';
import * as associateOrder from '../storage/cmosOrdersByStylist';
import * as customerOrder from '../storage/cmosOrdersByCustomer';
import * as objectMapper from '../tasks/cmosOrderDataMapper';
import { KinesisStreamEvent } from 'aws-lambda';
import { base64decode } from 'nodejs-base64';
import { isEmpty } from "lodash";
import { DataMapper } from '@aws/dynamodb-data-mapper';

export async function readCmosKinesisStream(event: KinesisStreamEvent) {
    logger.info({ message: 'Start CMOS ReadKinesisStream.' });
    logger.debug({ message: 'CMOS Order Event Feed', data: JSON.stringify(event) });
    const ddbMapper = await awsDynamodb.dynamodbMapper();
    for (const record of event.Records) {
        try {
            if (!record.kinesis.data) {
                logger.error('Missing data.');
            }
            let result = base64decode(record.kinesis.data);
            if (result.hasErrors) {
                logger.error({ message: 'There are errors while parsing CMOS Order Feed - kinesis stream...', data: result.errors });
            }
            await processOrder(result, ddbMapper);
        } catch (error) {
            logger.error({ message: error });
        }
    }
}

export async function processOrder(input: any, ddbMapper: DataMapper) {
    logger.info({ message: 'Start ProcessOrder() 1' });
    try{
        var payload1: CmosOrder = JSON.parse(input)
        logger.debug({ message: 'Payload 1', data: payload1 });
        logger.info({ message: 'Build CMOS Order Details()' });
        let cmosOrderDetails = await objectMapper.buildOrderDetails(payload1);
        if (!isEmpty(cmosOrderDetails) && cmosOrderDetails.omsOrderNumber != null) {
            await orderDetails.put(cmosOrderDetails, ddbMapper);
            logger.info({ message: `Successfully persisted CMOS order details for OrderID - ${cmosOrderDetails.omsOrderNumber}` });
            const omsExternalOrderNumber = payload1.eboPayload.OrderOut.orderHeader.externalOrderNumber;
            if (omsExternalOrderNumber && omsExternalOrderNumber.startsWith('SO')) {
                let posOrderId = objectMapper.constructPosOrderId(omsExternalOrderNumber);
                let cmosOrderId = cmosOrderDetails.omsOrderNumber;
                logger.info({ message: `Persisting CmosOrderNumber ${cmosOrderId} in OrderDetails Table for PosOrderID ${posOrderId} !!!` });
                await posOrderDetails.update(posOrderId, cmosOrderId, ddbMapper);
            } else {
                logger.info({ message: 'CMOS OmsExternalOrderNumber:  Is Empty !!!' });
            }
        } else {
            logger.info({ message: 'CMOS OrderDetails or OmsOrderNumber:  Is Empty !!!' });
        }
        var payload2: CmosOrder = JSON.parse(input)
        logger.info({ message: 'Start ProcessOrder() 2' });
        logger.debug({ message: 'Payload 2', data: payload2 });
        if (payload2.eboPayload.OrderOut.shipToCustomer) {
            let itemsList: itemDetails.CmosItemDetails[];
            logger.info({ message: 'Build CMOS OrderItem Details()' });
            itemsList = await objectMapper.buildOrderItemDetails(payload2);
            if (itemsList.length > 0 && !isEmpty(itemsList) && itemsList != undefined) {
                await itemDetails.batchWrite(itemsList, ddbMapper);
                logger.info({ message: 'Successfully persisted CMOS Order Line Item details !!!' });
            } else {
                logger.info({ message: 'CMOS ShipToCustomer - Line Items: Are Empty !!!' });
            }
        }
        if (payload2.eboPayload.OrderOut.orderHeader.employeePin) {
            logger.info({ message: 'Build CMOS Associate Order Details()' });
            let cmosOrderbyAssociate = await objectMapper.buildOrderDetailsbyAssociate(payload2);
            if (!isEmpty(cmosOrderbyAssociate) && cmosOrderbyAssociate.associatePin != null) {
                await associateOrder.put(cmosOrderbyAssociate, ddbMapper);
                logger.info({ message: `Successfully persisted CMOS Associate Order sales for EmployeePin -${cmosOrderbyAssociate.associatePin}` });
            }
        } else {
            logger.info({ message: 'CMOS OrderbyAssociate-AssociatePin/EmployeePin: Is Null !!!' });
        }
        if (payload2.eboPayload.OrderOut.soldTo[0].omsCustomerId) {
            logger.info({ message: 'Build POS Customer Order Details()' });
            let cmosOrderbyCustomer = await objectMapper.buildOrderDetailsbyCustomer(payload2);
            if (!isEmpty(cmosOrderbyCustomer) && cmosOrderbyCustomer.customerId != null) {
                await customerOrder.put(cmosOrderbyCustomer, ddbMapper);
                logger.info({ message: `Successfully persisted CMOS customer order for CustomerId- ${cmosOrderbyCustomer.customerId}` });
            }
        } else {
            logger.info({ message: 'CMOS OrderbyCustomer-soldTo[0].omsCustomerId: Is Null !!!' });
        }
    } catch (error) {
        logger.error({ message: 'Error processing the CMOS order feed' });
        throw new Error(error);
    }
}