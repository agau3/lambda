import logger from '@nmg/osp-backend-utils/logger';
import * as awsDynamodb from "../aws/dynamodb";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { PosOrder, POS_MESSAGE_TYPES } from '../dto/posOrder';
import * as orderDetails from '../storage/posOrderDetails';
import * as itemDetails from '../storage/posOrdersByItemDetails';
import * as associateOrder from '../storage/posOrdersByAssociate';
import * as customerOrder from '../storage/posOrdersByCustomer';
import * as objectMapper from '../tasks/posOrderDataMapper';
import { SQSRepository } from '../repositories/sqs';
import { KinesisStreamEvent } from 'aws-lambda';
import { base64decode } from 'nodejs-base64';
import { isEmpty } from "lodash";

const POS_UPDATE_ERROR = 'Error updating POS Order History Details to DynamoDB. Sending message to retry queue..';
const POS_LINKED_ORDER_ERROR = 'Error updating Linked POS to Original POS Order History Details in DynamoDB. Sending message to retry queue.';
const POS_VOID_ORDER_ERROR = 'Error updating Voided POS to Original POS Order History Details in DynamoDB. Sending message to retry queue.';
const sqsRepository = new SQSRepository();

export async function readPosKinesisStream(event: KinesisStreamEvent) {
    logger.info({ message: 'Start POS ReadKinesisStream.' });
    logger.debug({ message: 'POS Order Event Feed', data: JSON.stringify(event) });
    const ddbMapper = await awsDynamodb.dynamodbMapper();
    for (const record of event.Records) {
        try {
            if (!record.kinesis.data) {
                logger.error('Missing data.');
            }
            let result = base64decode(record.kinesis.data);
            if (result.hasErrors) {
                logger.error({ message: 'There are errors while parsing POS Order Feed - kinesis stream...', data: result.errors });
            }
            await processOrder(result, ddbMapper);
        } catch (error) {
            logger.error({ message: error });
        }
    }
}

export async function processOrder(input: any, ddbMapper: DataMapper, retryAttempt: number = 0) {
    logger.info({ message: 'Start ProcessOrder()' });
    try {
        var payload: PosOrder = JSON.parse(input);
        logger.debug({ message: 'Payload', data: payload });
        logger.info({ message: 'Build POS Order Details()' });
        let posOrderDetails = await objectMapper.buildOrderDetails(payload);
        logger.debug({ message: 'Built POS OrderDetails', data: posOrderDetails });
        const orderTranscationType = payload.eboPayload.OrderOut.orderHeader?.transactionType;

        payload.eboPayload.OrderOut.shipToCustomer.map(async cust => {
            if (cust.lineItem) {
                cust.lineItem.map(async line => {
                    if (!line.omsSkuId && !line.pimSkuId && !line.pimID) {
                        let itemSkuId = 'OSPSKU' + payload.eboPayload.OrderOut.orderHeader.storeNumber +
                            payload.eboPayload.OrderOut.orderHeader.terminalId +
                            payload.eboPayload.OrderOut.orderHeader.transactionNumber +
                            Math.floor((Math.random() * 100) + 1);
                        line.omsSkuId = itemSkuId
                        line.serviceFlag = "true"
                    } else {
                        line.serviceFlag = "false"
                    }
                })
            }
        })
        if (!isEmpty(posOrderDetails) && posOrderDetails.orderId != null) {
            await orderDetails.put(posOrderDetails, ddbMapper);
            logger.info({ message: `Successfully persisted POS order details for OrderID - ${posOrderDetails.orderId}` });
            await updateOrderReturnNumber(posOrderDetails, ddbMapper);
        } else {
            logger.info({ message: 'POS OrderDetails or In-Store OrderID:  Is Empty !!!' });
        }

        if(orderTranscationType && orderTranscationType === 'LINKED'){
            logger.info("Handling LINKED POS Orders");
            const linkedPosOrderId = payload.eboPayload.OrderOut.orderHeader.externalOrderNumber;
            const linkedPosCustomerId = payload.eboPayload.OrderOut.orderHeader.clientNumber;
            let orginalPosOrderId = objectMapper.generateOriginalOrderNumberLinked(payload);
            logger.info(`Update Original POS order: ${orginalPosOrderId} with the Customer ID: ${linkedPosCustomerId} from Linked POS Order - ${linkedPosOrderId}`);
            if (linkedPosCustomerId && orginalPosOrderId) {
                let posOriginalOrder = await objectMapper.buildPosDetailsbyLinkedOrder(orginalPosOrderId, linkedPosCustomerId);
                logger.debug({ message: 'Built POS Original Order Details by Linked POS Order', data: posOriginalOrder });
                if (!isEmpty(posOriginalOrder) && posOriginalOrder.orderId != null && orginalPosOrderId === posOriginalOrder.orderId) {
                    await orderDetails.updateOriginalPosOrder(orginalPosOrderId, posOriginalOrder, ddbMapper);
                } else {
                    logger.warn(`Mismatch between orginalPosOrderId: ${orginalPosOrderId} n posOriginalOrder.orderId: ${posOriginalOrder?.orderId} !!!`);
                    await handleUpdatesRetry(JSON.stringify(payload), POS_MESSAGE_TYPES.POS_ORDER_HISTORY_UPDATE, POS_LINKED_ORDER_ERROR, retryAttempt);
                }
            } else {
                logger.info("Update Original POS Order Unsuccesful because CustomerID or Original POS orderId is NULL..!!");
            }
        }

        if(orderTranscationType && orderTranscationType === 'POSTVOID'){
            logger.info("Handling VOID POS Orders");
            const voidedPosOrderId = payload.eboPayload.OrderOut.orderHeader.externalOrderNumber;
            let orginalPosOrderId = objectMapper.generateOriginalOrderNumber(payload);
            logger.info(`Update Original POS order: ${orginalPosOrderId} with VOID order status from VOIDED POS Order - ${voidedPosOrderId}`);
            if (orginalPosOrderId) {
                let posOriginalOrder = await objectMapper.buildPosDetailsbyVoidedOrder(orginalPosOrderId, orderTranscationType);
                logger.debug({ message: 'Built POS Original Order Details by Voided POS Order', data: posOriginalOrder });
                if (!isEmpty(posOriginalOrder) && posOriginalOrder.orderId != null && orginalPosOrderId === posOriginalOrder.orderId) {
                    await orderDetails.updateVoidOriginalPosOrder(orginalPosOrderId, posOriginalOrder, ddbMapper);
                } else {
                    logger.warn(`Mismatch between orginalPosOrderId: ${orginalPosOrderId} n posOriginalOrder.orderId: ${posOriginalOrder?.orderId} !!!`);
                    await handleUpdatesRetry(JSON.stringify(payload), POS_MESSAGE_TYPES.POS_ORDER_HISTORY_UPDATE, POS_VOID_ORDER_ERROR, retryAttempt);
                }
            }else {
                logger.info(`Update Original POS Order - "${orderTranscationType}" status Unsuccesful because Original POS orderId is NULL..!!`);
            }
        }

        if (payload.eboPayload.OrderOut.shipToCustomer) {
            let itemsList: itemDetails.PosItemDetails[];
            logger.info({ message: 'Build POS OrderItem Details()' });
            itemsList = await objectMapper.buildOrderItemDetails(payload);
            logger.debug({ message: 'Built posItemDetailsList', data: itemsList});
            if (itemsList.length > 0 && !isEmpty(itemsList) && itemsList != undefined) {
                await itemDetails.batchWrite(itemsList, ddbMapper);
                logger.info({ message: 'Successfully persisted POS Order Line Item details !!!' });
                await updateItemsReturnNumber(itemsList, ddbMapper);
            } else {
                logger.info({ message: 'POS ShipToCustomer - Line Items: Are Empty...!!!' });
            }
        }

        if (payload.eboPayload.OrderOut.orderHeader.employeePin) {
            let posOrderbyAssociateList: associateOrder.PosAssociateOrder[];
            logger.info({ message: 'Build POS Associate OrderItem Details()' });
            posOrderbyAssociateList = await objectMapper.buildOrderDetailsbyAssociate(payload, ddbMapper);
            logger.debug({ message: 'Built POS Associate Order Items List', data: posOrderbyAssociateList });
            if (posOrderbyAssociateList.length > 0 && !isEmpty(posOrderbyAssociateList) && posOrderbyAssociateList != undefined) {
                await associateOrder.batchWrite(posOrderbyAssociateList, ddbMapper);
                logger.info({ message: 'Successfully persisted POS associate order LineItem sales !!!' });
            }
        } else {
            logger.info({ message: 'POS OrderbyAssociate-AssociatePin/EmployeePin: Is Null !!!' });
        }

        const customerNumber = await getCustomerNumber(payload, ddbMapper);

        if (customerNumber) {
            logger.info({ message: 'Build POS Customer Order Details()' })
            let posOrderbyCustomer = await objectMapper.buildOrderDetailsbyCustomer(payload, customerNumber);
            logger.debug({ message: 'Built POS CustomerOrders', data: posOrderbyCustomer });
            if (!isEmpty(posOrderbyCustomer) && posOrderbyCustomer.customerId != null) {
                await customerOrder.put(posOrderbyCustomer, ddbMapper);
                logger.info({ message: `Successfully persisted POS customer order for ClientID - ${posOrderbyCustomer.customerId}` });
            }
        } else {
            logger.info({ message: 'POS OrderbyCustomer- CustomerId/ClientNumber: Is Null !!!' })
        }
    } catch (error) {
        console.error(`Exception caught while processing POS feed`,error)
        logger.error({ message: 'Error processing the POS order feed', data: error});
        // throw new Error(error);
        await handleUpdatesRetry(JSON.stringify(payload), POS_MESSAGE_TYPES.POS_ORDER_HISTORY_UPDATE, POS_UPDATE_ERROR, retryAttempt);
    }
}

async function updateOrderReturnNumber(order: orderDetails.PosOrderDetails, ddbMapper: DataMapper) {
    if (order.originalOrderNumber) {
        await orderDetails.updateReturnOrderNumber(order.originalOrderNumber, order.orderId, ddbMapper);
    }
}

async function updateItemsReturnNumber(items: itemDetails.PosItemDetails[], ddbMapper: DataMapper) {
    const orderId = items[0]?.originalOrderNumber || '';
    const dbItems: itemDetails.PosItemDetails[] = orderId
        ? await itemDetails.query(orderId, ddbMapper)
        : [];
    const validItems = items.filter(item => item.originalOrderNumber && item.omsSkuId);
    
    for (const item of validItems) {
        let [original] = dbItems.filter(dbItem => dbItem.omsSkuId === item.omsSkuId);
        if (original && original.timestamp) {
            formatReturns(original, item.orderId)
            await itemDetails.updateItem(original, ddbMapper);
        } else {
            logger.info({ message: `Order item with orderId/omsSkuId - (${orderId}/${item.omsSkuId}) not found.` });
        }
    }
}

function formatReturns(item: itemDetails.PosItemDetails, returnOrderNumber: string) {
    const returns = [ returnOrderNumber ];

    if (item.returnOrderNumber && Array.isArray(item.returnOrderNumber)) {
      returns.push(...item.returnOrderNumber);
    } else if (item.returnOrderNumber) {
      returns.push(item.returnOrderNumber.toString());
    }
    
    returns.reduce((unique, item) => { return item && unique.includes(item) ? unique : [...unique, item]; }, []);
    item.returnOrderNumber = returns;

    return item;
}

async function getCustomerNumber(payload: PosOrder, mapper: DataMapper): Promise<string> {
    if (payload.eboPayload.OrderOut.orderHeader.clientNumber) {
        return payload.eboPayload.OrderOut.orderHeader.clientNumber;
    }

    // OSP-4389 | If we do not get the client number in the POS Return order then we should get client number  
    // from the original order the POS return order is linked to.
    logger.debug({ message: 'CustomerId/ClientNumber is not present in reqquest payload, trying to get from original order.' })

    const originalOrderNumber = objectMapper.getOriginalOrderNumberForReturnedItem(payload);

    if (originalOrderNumber) {
        const originalOrder = await orderDetails.get(originalOrderNumber, mapper);
        return originalOrder.customerId;
    }

    return payload.eboPayload.OrderOut.orderHeader.clientNumber;
}

export async function handleUpdatesRetry(message: string, messageType: string, reason: string, retryAttempt: number = 0) {
    logger.debug({ message: reason, data: message });
    return sqsRepository.putOSPFailedMessage(message, messageType, reason, retryAttempt);
}