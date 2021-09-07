import { KinesisStreamEvent } from "aws-lambda";
import logger from '@nmg/osp-backend-utils/logger';
import { CmosOrder } from '../dto/cmosOrder';
import { base64decode } from 'nodejs-base64';
import { AssumeRoleResponse } from "aws-sdk/clients/sts";
import { fetchCredentials, dynamodbMapper } from "../aws/dynamodb";
import { CmosOrderStorage, CmosOrder as Order } from "../storage/cmosOrders";
import { formatOrderDate } from "../tasks/cmosOrderDataMapper";
// TODO Refactor
import * as posOrderDetails from '../storage/posOrderDetails';
import * as objectMapper from '../tasks/cmosOrderDataMapper';

export async function process(event: KinesisStreamEvent): Promise<void> {
    const credentials: AssumeRoleResponse = await fetchCredentials();
    const storage: CmosOrderStorage = new CmosOrderStorage(credentials);
    
    for (const record of event.Records) {
        const cmosOrder: CmosOrder = JSON.parse(base64decode(record.kinesis.data));
        try {
            const order: Order = mapCmosOrder(cmosOrder);
            await storage.put(order);
            logger.info({ message: `Order with id '${order.omsOrderNumber}' successfully persisted.` });
            // TODO Uncomment after old handler deprecation.
            // await updatePosOrder(cmosOrder);
        } catch (exception) {
            logger.error({ message: 'Error processing CMOS order.', exception });
            // TODO Create DLQ for temp persistance of failed records
        }
    }
}

async function updatePosOrder(order: CmosOrder) {
    const omsExternalOrderNumber = order.eboPayload.OrderOut.orderHeader.externalOrderNumber;
    if (omsExternalOrderNumber && omsExternalOrderNumber.startsWith('SO')) {
        const ddbMapper = await dynamodbMapper();
        
        let posOrderId = objectMapper.constructPosOrderId(omsExternalOrderNumber);
        let cmosOrderId = order.eboPayload.OrderOut.orderHeader.id[0].omsOrderNumber;
        
        logger.info({ message: `Persisting CmosOrderNumber ${cmosOrderId} in OrderDetails Table for PosOrderID ${posOrderId}.` })
        
        await posOrderDetails.update(posOrderId, cmosOrderId, ddbMapper);
    } else {
        logger.info({ message: 'ExternalOrderNumber number is missing.' });
    }
}

function mapCmosOrder(order: CmosOrder): Order {
    return {
        omsOrderNumber: order.eboPayload.OrderOut.orderHeader.id[0].omsOrderNumber,
        externalOrderNumber: order.eboPayload.OrderOut.orderHeader.externalOrderNumber,
        omsCustomerId: order.eboPayload.OrderOut.soldTo[0].omsCustomerId,
        associatePin: order.eboPayload.OrderOut.orderHeader.employeePin,
        orderDate: formatOrderDate(order.eboPayload.OrderOut.orderHeader.orderDate),
        orderSourceSystem: order.eboPayload.OrderOut.orderSourceSystem,
        orderTargetSystem: order.eboPayload.OrderOut.orderTargetSystem,
        orderHeader: order.eboPayload.OrderOut.orderHeader,
        soldTo: order.eboPayload.OrderOut.soldTo,
        payment: order.eboPayload.OrderOut.payment,
        shipToCustomer: order.eboPayload.OrderOut.shipToCustomer,
    }
}