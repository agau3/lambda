import { PosOrder, Payment, LineItem } from '../dto/posOrder';
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { PaymentDetails, ShippingAddress, PosOrderDetails, SoldTo, get } from '../storage/posOrderDetails';
import * as itemDetails from '../storage/posOrdersByItemDetails';
import { PosAssociateOrder } from '../storage/posOrdersByAssociate';
import { PosCustomerOrder } from '../storage/posOrdersByCustomer';
import logger from '@nmg/osp-backend-utils/logger';
import * as awsDynamodb from "../aws/dynamodb";
import { isEmpty } from "lodash";

class posOrderDataMapper {
    data: string;
    constructor(data) {
        this.data = data;
    }
}

let posOrderDetails: PosOrderDetails;
let originalOrderNumber = '';

async function buildOrderDetails(payload: PosOrder): Promise<PosOrderDetails> {
    logger.debug({ message: 'Inside buildOrderDetails()', data: payload });
    let shippingAddress: ShippingAddress = {}
    let totalLineItemReturn = 0;
    let totalLineItemSales = 0;

    if (payload.eboPayload.OrderOut.shipToCustomer) {
        var shipCustomer = payload.eboPayload.OrderOut.shipToCustomer[0];

        shippingAddress = {
            firstName: shipCustomer.shipToFirstName,
            lastName: shipCustomer.shipToLastName,
            line1: shipCustomer.shipToAddressLine1,
            line2: shipCustomer.shipToAddressLine2,
            line3: shipCustomer.shipToAddressLine3,
            city: shipCustomer.shipToCity,
            stateCode: shipCustomer.shipToStateCode,
            countryCode: shipCustomer.shipToCountryCode,
            zipCode: shipCustomer.shipToZipCode
        }

        for (var i = 0; i < payload.eboPayload.OrderOut.shipToCustomer.length; i++) {
            if (payload.eboPayload.OrderOut.shipToCustomer[i].lineItem) {
                for (var lineItem of payload.eboPayload.OrderOut.shipToCustomer[i].lineItem) {
                    if (lineItem.transactionType === 'RETURN') {
                        if (!(['150', '903', '995', '904'].includes(lineItem.nDept))) {
                            totalLineItemReturn = totalLineItemReturn + (parseFloat(lineItem.priceEach) * parseInt(lineItem.quantity))
                        }
                    }

                    else {
                        if (!(['150', '903', '995', '904'].includes(lineItem.nDept))) {
                            totalLineItemSales = totalLineItemSales + (parseFloat(lineItem.priceEach) * parseInt(lineItem.quantity))
                        }
                    }
                }
            }
        }
    }

    const formattedOrderId = formatOrderId(payload.eboPayload.OrderOut.orderHeader.externalOrderNumber);

    posOrderDetails = {
        orderId: payload.eboPayload.OrderOut.orderHeader.externalOrderNumber,
        formattedOrderId: formattedOrderId,
        shouldDisplay: true,
        orderDate: formatPosDate(payload.eboPayload.OrderOut.orderHeader.orderDate),
        orderStatus: payload.eboPayload.OrderOut.orderHeader.transactionType,
        orderSourceSystem: payload.eboPayload.OrderOut.orderSourceSystem,
        orderTargetSystem: payload.eboPayload.OrderOut.orderTargetSystem,
        totalOrderAmount: payload.eboPayload.OrderOut.orderHeader.totalOrderAmount,
        totalSaleAmount: payload.eboPayload.OrderOut.orderHeader.totalSaleAmount,
        totalRefundAmount: payload.eboPayload.OrderOut.orderHeader.totalRefundAmount,
        subtotal: payload.eboPayload.OrderOut.orderHeader.subtotal,
        totalStateTaxAmount: payload.eboPayload.OrderOut.orderHeader.totalStateTaxAmount,
        totalCountyTaxAmount: payload.eboPayload.OrderOut.orderHeader.totalCountyTaxAmount,
        totalCityTaxAmount: payload.eboPayload.OrderOut.orderHeader.totalCityTaxAmount,
        totalLocalTaxAmount: payload.eboPayload.OrderOut.orderHeader.totalLocalTaxAmount,
        paymentDetails: await buildPaymentDetails(payload),
        additionalPaymentDetails: await buildAdditionalPaymentDetails(payload),
        originalOrderNumber: payload.eboPayload.OrderOut.orderHeader.originalTransactionNumber ? generateOriginalOrderNumber(payload) : '',
        soldTo: await constructSoldToInformation(payload),
        shipToCustomer: shippingAddress,
        totalLineItemSales: totalLineItemSales,
        totalLineItemReturn: totalLineItemReturn,
        message: JSON.stringify(payload),
        lastUpdatedTimestamp: getCurrentDateTime(),
        customerId: payload.eboPayload.OrderOut.orderHeader.clientNumber
    }
    return Promise.resolve(posOrderDetails);
}

async function constructSoldToInformation(payload: PosOrder, lineItem?: LineItem): Promise<SoldTo> {
    let firstName = payload.eboPayload.OrderOut.soldTo[0].firstName;
    let lastName = payload.eboPayload.OrderOut.soldTo[0].lastName;

    if (firstName && lastName) {
        return { firstName, lastName };
    }

    // OSP-3857 | If we do not get the clients name in the POS Return order then we should display the name of the client 
    // from the original order the POS return order is linked to.
    // We're going to take first returned product's original order number to get soldTo info.
    let originalOrderNumber: string;

    if (lineItem) {
        originalOrderNumber = generateOriginalOrderNumberReturn(lineItem);
    } else {
        originalOrderNumber = getOriginalOrderNumberForReturnedItem(payload);
    }

    if (originalOrderNumber) {
        const mapper = await awsDynamodb.dynamodbMapper();
        const originalOrder = await get(originalOrderNumber, mapper);
        return originalOrder.soldTo;
    }

    return { firstName, lastName };
}

export function getOriginalOrderNumberForReturnedItem(payload: PosOrder) {
    logger.debug({ message: 'Inside getOriginalOrderNumberForReturnedItem()', data: payload });
    const returnedItems: LineItem[] = payload.eboPayload.OrderOut.shipToCustomer.reduce((items, stc) => {
        if (stc.lineItem) {
            items.push(...(stc.lineItem.filter(item => item.transactionType === 'RETURN')));
            return items;
        }
    }, []);
    return returnedItems && returnedItems.length > 0
        ? generateOriginalOrderNumberReturn(returnedItems[0])
        : undefined;
}

async function buildPaymentDetails(payload: PosOrder): Promise<PaymentDetails> {
    logger.debug({ message: 'Inside buildPaymentDetails()...' });
    let paymentDetails: PaymentDetails = {
        amountReceived: payload.eboPayload.OrderOut.payment[0].amountReceived,
        maskedCardNumber: getCardDetails(payload.eboPayload.OrderOut.payment[0]),
        type: payload.eboPayload.OrderOut.payment[0].type,
        posType: payload.eboPayload.OrderOut.payment[0].posType
    }

    return Promise.resolve(paymentDetails)
}

async function buildAdditionalPaymentDetails(payload: PosOrder): Promise<PaymentDetails[]> {
    logger.debug({ message: 'Inside buildAdditionalPaymentDetails()...' })
    if (payload.eboPayload.OrderOut.payment && payload.eboPayload.OrderOut.payment.length > 1) {
        var additionalPayment: PaymentDetails[] = []
        for (var i = 1; i < payload.eboPayload.OrderOut.payment.length; i++) {
            var paymentDetails: PaymentDetails = {
                amountReceived: payload.eboPayload.OrderOut.payment[i].amountReceived,
                maskedCardNumber: getCardDetails(payload.eboPayload.OrderOut.payment[i]),
                type: payload.eboPayload.OrderOut.payment[i].type,
                posType: payload.eboPayload.OrderOut.payment[i].posType
            }
            additionalPayment.push(paymentDetails)
        }
        return Promise.resolve(additionalPayment)
    }
    else
        return []
}

async function buildPosDetailsbyLinkedOrder(originalOrderId?: string, linkedCustomerId?: string): Promise<PosOrderDetails> {
    const mapper = await awsDynamodb.dynamodbMapper();
    let originalPosOrder = await get(originalOrderId, mapper);
    if(!isEmpty(originalPosOrder)){
        originalPosOrder.customerId = linkedCustomerId;
        const originalPosOrderDetails: PosOrder = JSON.parse(originalPosOrder.message || '{}');
        originalPosOrderDetails.eboPayload.OrderOut.soldTo[0].externalCustomerId = linkedCustomerId;
        originalPosOrderDetails.eboPayload.OrderOut.orderHeader.clientNumber = linkedCustomerId;
        originalPosOrder.message = JSON.stringify(originalPosOrderDetails);
    }
return Promise.resolve(originalPosOrder);
}

async function buildPosDetailsbyVoidedOrder(originalOrderId?: string, orderTransactionType?:string): Promise<PosOrderDetails> {
    const mapper = await awsDynamodb.dynamodbMapper();
    let originalPosOrder = await get(originalOrderId, mapper);
    if(!isEmpty(originalPosOrder)){
        originalPosOrder.orderStatus = orderTransactionType;
        const originalPosOrderDetails: PosOrder = JSON.parse(originalPosOrder.message || '{}');
        originalPosOrderDetails.eboPayload.OrderOut.orderHeader.transactionType = orderTransactionType;
        originalPosOrder.message = JSON.stringify(originalPosOrderDetails);
    }
return Promise.resolve(originalPosOrder);
}

async function buildOrderItemDetails(payload: PosOrder): Promise<itemDetails.PosItemDetails[]> {
    logger.debug({ message: 'Inside buildOrderItemDetails()', data: payload });
    let posItemDetailsList: itemDetails.PosItemDetails[] = [];
    let posItemDetails: itemDetails.PosItemDetails;
    let orderNumber = payload.eboPayload.OrderOut.orderHeader.externalOrderNumber;
    let orderDate = formatPosDate(payload.eboPayload.OrderOut.orderHeader.orderDate);
    let currentTimestamp = buildTimeStamp(orderDate);
    let assocPin1 = "";
    let assocPin2 = "";
    for (var i = 0; i < payload.eboPayload.OrderOut.shipToCustomer.length; i++) {
        if (payload.eboPayload.OrderOut.shipToCustomer[i].lineItem) {
            let itemArray = payload.eboPayload.OrderOut.shipToCustomer[i].lineItem;
            for (var index in itemArray) {
                var lineItem = itemArray[index];
                assocPin1 = lineItem.assCommissionPin1;
                assocPin2 = lineItem.assCommissionPin2;
                posItemDetails = {
                    orderId: orderNumber,
                    timestamp: currentTimestamp + '_' + Math.random().toString(36).substr(2, 5),
                    omsLineItemId: lineItem.omsLineItemId,
                    omsSkuId: lineItem.pimSkuId?lineItem.pimSkuId: (lineItem.pimID?lineItem.pimID: lineItem.omsSkuId),
                    orderDate: orderDate,
                    orderSourceSystem: payload.eboPayload.OrderOut.orderSourceSystem,
                    orderTargetSystem: payload.eboPayload.OrderOut.orderTargetSystem,
                    transactionType: lineItem.transactionType,
                    originalOrderNumber: generateOriginalOrderNumberReturn(lineItem),
                    assocCommissionPin1: assocPin1,
                    assocCommissionPin2: assocPin2,
                    soldTo: await constructSoldToInformation(payload, lineItem),
                    itemDetail: lineItem
                };
                logger.debug({ message: 'Built POS OrderItem Details', data: posItemDetails });
                posItemDetailsList.push(posItemDetails);
            }
        }
    }
    return Promise.resolve(posItemDetailsList);
}

async function buildOrderDetailsbyAssociate(payload: PosOrder, ddbMapper: DataMapper): Promise<PosAssociateOrder[]> {
    logger.debug({ message: 'Inside buildOrderDetailsbyAssociate()', data: payload });
    let posAssociateOrderList: PosAssociateOrder[] = [];
    let associateOrder: PosAssociateOrder;
    try {
        for (let i = 0; i < payload.eboPayload.OrderOut.shipToCustomer.length; i++) {
            if (payload.eboPayload.OrderOut.shipToCustomer[i].lineItem) {
                for (let j = 0; j < payload.eboPayload.OrderOut.shipToCustomer[i].lineItem.length; j++) {
                    let item = payload.eboPayload.OrderOut.shipToCustomer[i].lineItem[j];
                    let salesAmount = 0;
                    let returnsAmount = 0;
                    let saleAssociatePins: string[] = [];
                    if (item.omsSkuId) {
                        if (item.transactionType === 'SEND' || item.transactionType === 'TAKE') {
                            logger.info({ message: `Inside Individual LineItem TransactionType ${item.transactionType}` }); 
                            if(item.assCommissionPin1){saleAssociatePins.push(item.assCommissionPin1)};
                            if(item.assCommissionPin2){saleAssociatePins.push(item.assCommissionPin2)};

                            if (saleAssociatePins !== null && saleAssociatePins.length>0 && saleAssociatePins !== undefined) {
                                logger.info({ message: 'SALE associatePins', data: saleAssociatePins});
                                for (const assocPin of saleAssociatePins) {
                                    if (saleAssociatePins.length>1){
                                        salesAmount = parseFloat(item.extendedPrice)/2;
                                    } else {
                                        salesAmount = parseFloat(item.extendedPrice);
                                    }
                                    associateOrder = await buildPosAssociateOrderItem(payload, item, assocPin, salesAmount, returnsAmount);
                                    associateOrder.commissionableItem = item.commissionableItem?item.commissionableItem:'N'
                                    associateOrder.serviceFlag = item.serviceFlag
                                    posAssociateOrderList.push(associateOrder);
                                }
                            }
                        } else if (item.transactionType === 'RETURN' &&
                            (originalOrderNumber !== '' && originalOrderNumber !== null && originalOrderNumber !== undefined)) {
                            logger.info({ message: `Inside Individual LineItem TransactionType ${item.transactionType}, originalOrderNumber:${originalOrderNumber}` });
                            const skuId = item.pimSkuId?item.pimSkuId: (item.pimID?item.pimID: item.omsSkuId);
                            const returnAssociatePins = await itemDetails.fetchAssociatePins(originalOrderNumber, skuId, ddbMapper);    
                            logger.debug({ message: 'RETURN associatePins', data: returnAssociatePins});
                            const employeePin = payload.eboPayload.OrderOut.orderHeader.employeePin;
                            if (!returnAssociatePins.includes(employeePin)){
                                logger.info({ message: 'EmployeePin not matching RETRUN associatePins', data: employeePin});
                                associateOrder = await buildPosAssociateOrderItem(payload, item, employeePin, salesAmount, returnsAmount);
                                associateOrder.commissionableItem = 'N'
                                associateOrder.serviceFlag = item.serviceFlag
                                posAssociateOrderList.push(associateOrder);
                            }
                            if (returnAssociatePins !== null && returnAssociatePins.length>0 && returnAssociatePins !== undefined) {
                                for (const assocPin of returnAssociatePins) {
                                    logger.info({ message: 'Each RETURN associatePin', data: assocPin});
                                    if (returnAssociatePins.length>1){
                                        returnsAmount = parseFloat(item.extendedPrice)/(returnAssociatePins.length);
                                    } else {
                                        returnsAmount = parseFloat(item.extendedPrice);
                                    }
                                    associateOrder = await buildPosAssociateOrderItem(payload, item, assocPin, salesAmount, returnsAmount);
                                    associateOrder.commissionableItem = 'Y'
                                    associateOrder.serviceFlag = item.serviceFlag
                                    posAssociateOrderList.push(associateOrder);
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.error({ message: 'Error buildling Associate Order LineItem Details', data: error });
    }
    return posAssociateOrderList;
}

async function buildPosAssociateOrderItem(payload: PosOrder, lineItem: LineItem, assocPin: string, salesAmount: number, returnAmount: number) {
    logger.debug({ message: `Inside Build POS Associate Order Item -> assocPin: ${assocPin} ,salesAmount: ${salesAmount} ,returnAmount: ${returnAmount}` });
    let posAssociateOrder: PosAssociateOrder;
    let orderNumber = payload.eboPayload.OrderOut.orderHeader.externalOrderNumber;
    let orderDate = formatPosDate(payload.eboPayload.OrderOut.orderHeader.orderDate);
    let currentTimestamp = buildTimeStamp(orderDate);

    const soldTo = await constructSoldToInformation(payload, lineItem);

    posAssociateOrder = {
        associatePin: assocPin,
        timestamp: currentTimestamp + '_' + Math.random().toString(36).substr(2, 5),
        orderDate: orderDate,
        omsSkuId: lineItem.pimSkuId?lineItem.pimSkuId: (lineItem.pimID?lineItem.pimID: lineItem.omsSkuId),
        orderSourceSystem: payload.eboPayload.OrderOut.orderSourceSystem,
        orderTargetSystem: payload.eboPayload.OrderOut.orderTargetSystem,
        transactionType: lineItem.transactionType,
        accountId: payload.eboPayload.OrderOut.orderHeader.clientNumber,
        orderId: orderNumber,
        formattedOrderId: formatOrderId(orderNumber),
        totalOrderAmount: payload.eboPayload.OrderOut.orderHeader.totalOrderAmount ? payload.eboPayload.OrderOut.orderHeader.totalOrderAmount.toString() : '0',
        itemSalesAmount: salesAmount,
        itemReturnsAmount: returnAmount,
        itemQuantity: lineItem.quantity,
        firstName: soldTo.firstName,
        lastName: soldTo.lastName,
        orderTransactionType: payload.eboPayload.OrderOut.orderHeader.transactionType
    };
    logger.debug({ message: 'Built POS Associate Order Item', data: posAssociateOrder });
    return posAssociateOrder;
}

async function buildOrderDetailsbyCustomer(payload: PosOrder, originalCustomerId?: string): Promise<PosCustomerOrder> {
    logger.debug({ message: 'Inside buildOrderDetailsbyCustomer()', data: payload });

    let skuList: string[] = [];
    for (var i = 0; i < payload.eboPayload.OrderOut.shipToCustomer.length; i++) {
        if (payload.eboPayload.OrderOut.shipToCustomer[i].lineItem) {
            payload.eboPayload.OrderOut.shipToCustomer[i].lineItem.forEach(item => {
                if (item.omsSkuId)
                    skuList.push(item.pimSkuId?item.pimSkuId: (item.pimID?item.pimID: item.omsSkuId))
            });
        }
    }
    const soldTo = await constructSoldToInformation(payload);
    const orderDate = formatPosDate(payload.eboPayload.OrderOut.orderHeader.orderDate);
    let posCustomerOrder: PosCustomerOrder = {
        customerId: originalCustomerId || payload.eboPayload.OrderOut.orderHeader.clientNumber,
        timestamp: buildTimeStamp(orderDate),
        orderDate,
        orderSourceSystem: payload.eboPayload.OrderOut.orderSourceSystem,
        orderTargetSystem: payload.eboPayload.OrderOut.orderTargetSystem,
        associatePin: payload.eboPayload.OrderOut.orderHeader.employeePin,
        itemSKUs: skuList,
        orderId: payload.eboPayload.OrderOut.orderHeader.externalOrderNumber,
        formattedOrderId: formatOrderId(payload.eboPayload.OrderOut.orderHeader.externalOrderNumber),
        totalAmount: payload.eboPayload.OrderOut.orderHeader.totalOrderAmount ? payload.eboPayload.OrderOut.orderHeader.totalOrderAmount.toString() : '0',
        firstName: soldTo.firstName,
        lastName: soldTo.lastName,
        transactionType: payload.eboPayload.OrderOut.orderHeader.transactionType
    };
    return Promise.resolve(posCustomerOrder);
}

function getCurrentDateTime() {
    let date_ob = new Date();
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = date_ob.getHours();
    let minutes = date_ob.getMinutes();
    let seconds = date_ob.getSeconds();
    let milliSeconds = date_ob.getMilliseconds();
    let currentDateTime = year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds + ":" + milliSeconds;
    return currentDateTime;
}

function buildTimeStamp(orderDate: string) {
    const current = new Date();
    return `${orderDate} ${current.getHours()}:${current.getMinutes()}:${current.getSeconds()}:${current.getMilliseconds()}`;
}

export function getCurrentDate() {
    let date_ob = new Date();
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let currentDateTime = year + "-" + month + "-" + date;
    return currentDateTime;
}

function formatDate(posDate: string) {
    let month = posDate.slice(0, 2);
    let date = posDate.slice(3, 5);
    let year = posDate.slice(6)
    let currentDateTime = year + month + date;
    return currentDateTime;
}

export function formatOrderId(orderId: string) {
    if (orderId && orderId.includes(':')) {
        let orderSegments = orderId.split(':');
        if (orderSegments) {
            let storeId = orderSegments[0].padStart(3, '0');
            let terminalId = orderSegments[1].padStart(4, '0');
            let transactionId = orderSegments[2].padStart(4, '0');
            let orderDate = formatOrderDate(orderSegments[3]);
            let formattedOrderId = storeId + '/' + terminalId + '/' + transactionId + '/' + orderDate;
            return formattedOrderId;
        }
    } else {
        return orderId;
    }
}

export function formatOrderDate(orderDate: string) {
    if (orderDate) {
        let month = orderDate.slice(4, 6);
        let date = orderDate.slice(6, 8);
        let year = orderDate.slice(2, 4)
        let formattedDate = month + date + year;
        return formattedDate;
    }
    return orderDate
}

export function formatPosDate(posDate: string) {

    if (posDate) {
        let month = posDate.slice(0, 2);
        let date = posDate.slice(3, 5);
        let year = posDate.slice(6)
        let currentDateTime = year + '-' + month + '-' + date;
        return currentDateTime;
    }
    return getCurrentDate()
}

export function generateOriginalOrderNumberReturn(lineItem: LineItem): string {
    logger.debug({ message: 'Inside generateOriginalOrderNumberReturn()', data: lineItem });

    if (lineItem && lineItem.transactionType === 'RETURN'
        && lineItem.return.originalDate
        && lineItem.return.originalStore
        && lineItem.return.originalRegister
        && lineItem.return.originalTransaction) {

        logger.debug({ message: 'Inside generateOriginalOrderNumberReturn()', data: lineItem });
        let orderNumber = lineItem.return.originalStore[0] + ':' + lineItem.return.originalRegister[0] + ':' + lineItem.return.originalTransaction[0]
        let originalOrderDate = formatDate(lineItem.return.originalDate[0])
        originalOrderNumber = orderNumber + ':' + originalOrderDate
        logger.debug({ message: `Generated OriginalOrderNumber : ${originalOrderNumber}` })
    } else {
        originalOrderNumber = ""
    }
    return originalOrderNumber
}

export function generateOriginalOrderNumber(payload: PosOrder): string {
    logger.debug({ message: 'Inside generateOriginalOrderNumber()', data: payload });
    return payload.eboPayload.OrderOut.orderHeader.storeNumber + ':'
        + payload.eboPayload.OrderOut.orderHeader.terminalId + ':'
        + payload.eboPayload.OrderOut.orderHeader.originalTransactionNumber + ':'
        + formatDate(payload.eboPayload.OrderOut.orderHeader.originalOrderDate)
}

export function generateOriginalOrderNumberLinked(payload: PosOrder): string {
    logger.debug({ message: 'Inside generateOriginalOrderNumberLinked()', data: payload });
    return payload.eboPayload.OrderOut.orderHeader.linkedStoreNumber + ':'
        + payload.eboPayload.OrderOut.orderHeader.linkedTerminalId + ':'
        + payload.eboPayload.OrderOut.orderHeader.linkedTransactionNumber + ':'
        + formatDate(payload.eboPayload.OrderOut.orderHeader.linkedOrderDate)
}

export function getCardDetails(payment: Payment): string {
    if (payment.type && payment.type !== 'CASH')
        return payment.account.padStart(16, 'x');
    else
        return ''
}


export { posOrderDataMapper, 
    buildOrderDetails, 
    buildOrderDetailsbyAssociate, 
    buildOrderDetailsbyCustomer, 
    buildOrderItemDetails, 
    buildPosDetailsbyLinkedOrder,
    buildPosDetailsbyVoidedOrder };