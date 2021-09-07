import { attribute, hashKey, table } from "@aws/dynamodb-data-mapper-annotations";
import { UpdateExpression, ConditionExpression } from '@aws/dynamodb-expressions';
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { requireProperty } from "../util/conf";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME =requireProperty('POS_ORDER_DETAILS_TABLE_NAME');

interface PosOrderDetails {
  orderId: string
  formattedOrderId?: string
  cmosOrderNumber?: string
  orderDate: string
  orderStatus: string
  orderSourceSystem: string
  orderTargetSystem?: string
  totalOrderAmount: string
  totalSaleAmount: string
  totalRefundAmount: string
  subtotal: string
  totalStateTaxAmount: string
  totalCountyTaxAmount: string
  totalCityTaxAmount: string
  totalLocalTaxAmount: string
  paymentDetails: PaymentDetails
  additionalPaymentDetails: PaymentDetails[]
  originalOrderNumber?: string
  returnOrderNumber?: Object
  shouldDisplay?: boolean
  soldTo: SoldTo
  shipToCustomer?: ShippingAddress
  totalLineItemSales?: number
  totalLineItemReturn?: number
  message: string
  lastUpdatedTimestamp: string
  customerId?: string
}

interface PaymentDetails {
  amountReceived: string
  maskedCardNumber: string
  type: string
  posType: string
}
interface SoldTo {
  firstName: string
  lastName: string
}

interface ShippingAddress {
  city?: string,
  countryCode?: string,
  firstName?: string,
  lastName?: string,
  line1?: string,
  line2?: string,
  line3?: string,
  phoneNumber?: string,
  stateCode?: string,
  zipCode?: string,
}

enum TransactionType {
  SALE,
  RETURN,
  HOLD,
  POSTVOID,
  LINKED,
  MIDVOID
}

enum ItemType {
  TAKE,
  SEND,
  RETURN
}

@table(TABLE_NAME)
class PosOrderHistory implements PosOrderDetails {
  @hashKey()
  orderId: string;
  @attribute()
  cmosOrderNumber: string;
  @attribute()
  formattedOrderId?: string;
  @attribute()
  orderDate: string;
  @attribute()
  orderStatus: string;
  @attribute()
  orderSourceSystem: string
  @attribute()
  orderTargetSystem?: string
  @attribute()
  totalOrderAmount: string;
  @attribute()
  totalSaleAmount: string;
  @attribute()
  totalRefundAmount: string;
  @attribute()
  subtotal: string;
  @attribute()
  totalStateTaxAmount: string
  @attribute()
  totalCountyTaxAmount: string;
  @attribute()
  totalCityTaxAmount: string;
  @attribute()
  totalLocalTaxAmount: string;
  @attribute()
  paymentDetails: PaymentDetails;
  @attribute()
  additionalPaymentDetails:[PaymentDetails];
  @attribute()
  shouldDisplay: boolean;
  @attribute()
  soldTo: SoldTo;
  @attribute()
  shipToCustomer?: ShippingAddress;
  @attribute()
  totalLineItemSales?: number;
  @attribute()
  totalLineItemReturn?: number;
  @attribute()
  receiveTimestamp: number;
  @attribute()
  transactionType: string;
  @attribute()
  message: string;
  @attribute()
  originalOrderNumber: string;
  @attribute()
  returnOrderNumber: Object;
  @attribute()
  lastUpdatedTimestamp: string;
  @attribute()
  customerId?: string;

  constructor(orderId?: string) {
    this.orderId = orderId || ''
  }
}

async function get(id: string, ddbMapper: DataMapper): Promise<PosOrderDetails> {
  let emptyEntry = new PosOrderHistory(id)
  return ddbMapper.get(emptyEntry)
    .catch(error => {
      if (error.name === 'OrderNotFoundException') {
        return emptyEntry
      } else {
        logger.error(`Error getting POS order details for ID: (${id})`)
        throw new Error(error)
      }
    })
} 

async function put(orderEntry: PosOrderDetails, ddbMapper: DataMapper): Promise<PosOrderDetails> {
  return await ddbMapper.put(Object.assign(new PosOrderHistory, removeEmpty(orderEntry)))
    .catch(error => {
      logger.error({message: `Error persisting PosOrderdetails for OrderID:(${orderEntry.orderId})`, data: error})
      throw new Error(error);
    })
}

async function update(posOrderId: string, cmosOrderId: string, ddbMapper: DataMapper) {
  const toUpdate = new PosOrderHistory();
  let updated;
  try{
    toUpdate.orderId = posOrderId;
    logger.debug({message: 'To Update', data: toUpdate});
    const updateExp = new UpdateExpression();
    updateExp.set('cmosOrderNumber', cmosOrderId);
  
    let condition: ConditionExpression = {
        type: 'Equals',
        subject: 'orderId',
        object: posOrderId
    };
    logger.debug({message: 'Update Query Condition..', data: condition});
    updated = await ddbMapper.executeUpdateExpression(updateExp, toUpdate, PosOrderHistory, {condition});
    logger.info({message: 'Successfully Persisted CmosOrderNumber in POS-Order-Details Table'});
    logger.debug({message: 'Updated pos-order-details DDB Record', data: updated});
  } catch(error){
    logger.error({message: `Error persisting CmosOrderID:(${cmosOrderId}) in pos-order-details Table for PosOrderID:(${posOrderId})`, data: error});
  }
  return updated;
}

async function updateOriginalPosOrder(posOrderId: string, posOrderDetails: PosOrderDetails, ddbMapper: DataMapper) {
  const toUpdate = new PosOrderHistory();
  let updated;
  try{
    toUpdate.orderId = posOrderId;
    logger.debug({message: 'To Update', data: toUpdate});
    const updateExp = new UpdateExpression();
    updateExp.set('customerId', posOrderDetails.customerId);
    updateExp.set('message', posOrderDetails.message);
  
    let condition: ConditionExpression = {
        type: 'Equals',
        subject: 'orderId',
        object: posOrderId
    };
    logger.debug({message: 'Update Query Condition', data: condition});
    updated = await ddbMapper.executeUpdateExpression(updateExp, toUpdate, PosOrderHistory, {condition});
    logger.info(`Successfully Updated Linked POS CustomerId to Originial POS Order "${posOrderId}" in POS-Order-Details Table`);
    logger.debug({message: 'Updated pos-order-details DDB Record', data: updated});
  } catch(error){
    logger.error({message: `Error updating in pos-order-details Table for PosOrderID:(${posOrderId})`, data: error});
    throw new Error(error);
  }
  return updated;
}

async function updateVoidOriginalPosOrder(posOrderId: string, posOrderDetails: PosOrderDetails, ddbMapper: DataMapper) {
  const toUpdate = new PosOrderHistory();
  let updated;
  try{
    toUpdate.orderId = posOrderId;
    logger.debug({message: 'To Update', data: toUpdate});
    const updateExp = new UpdateExpression();
    updateExp.set('orderStatus', posOrderDetails.orderStatus);
    updateExp.set('message', posOrderDetails.message);
  
    let condition: ConditionExpression = {
        type: 'Equals',
        subject: 'orderId',
        object: posOrderId
    };
    logger.debug({message: 'Update Query Condition', data: condition});
    updated = await ddbMapper.executeUpdateExpression(updateExp, toUpdate, PosOrderHistory, {condition});
    logger.info(`Successfully Updated "${posOrderDetails.orderStatus}" Status to Originial POS Order "${posOrderId}" in POS-Order-Details Table`);
    logger.debug({message: 'Updated pos-order-details DDB Record', data: updated});
  } catch(error){
    logger.error({message: `Error updating in pos-order-details Table for PosOrderID:(${posOrderId})`, data: error});
    throw new Error(error);
  }
  return updated;
}

async function updateReturnOrderNumber(originalOrderNumber: string, returnOrderNumber: string, ddbMapper: DataMapper) {
  try {
    let order = await get(originalOrderNumber, ddbMapper);
    const returns: string[] = [ returnOrderNumber ];

    if (order.returnOrderNumber && Array.isArray(order.returnOrderNumber)) {
      returns.push(...order.returnOrderNumber);
    } else if (order.returnOrderNumber) {
      returns.push(order.returnOrderNumber.toString());
    }
    
    returns.reduce((unique, item) => { return item && unique.includes(item) ? unique : [...unique, item]; }, []);

    order.returnOrderNumber = returns;
    await put(order, ddbMapper);
  } catch (error) {
    logger.error({message: `Error updating original order:(${originalOrderNumber}) with return order number:(${returnOrderNumber})`, data: error});
  }
}

export { get, put, update, 
  TransactionType, ItemType, PosOrderDetails, PaymentDetails, SoldTo, ShippingAddress, 
  updateOriginalPosOrder, 
  updateReturnOrderNumber,
  updateVoidOriginalPosOrder };
