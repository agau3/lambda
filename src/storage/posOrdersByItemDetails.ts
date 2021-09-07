import * as posOrder from '../dto/posOrder';
import { attribute, hashKey, rangeKey, table } from "@aws/dynamodb-data-mapper-annotations";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { requireProperty } from "../util/conf";
import { WriteType } from "@aws/dynamodb-data-mapper";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';
import { ConditionExpression, ProjectionExpression, UpdateExpression, equals} from '@aws/dynamodb-expressions';

const TABLE_NAME = requireProperty('POS_ITEM_DETAILS_TABLE_NAME')

interface PosItemDetails{
    orderId: string
    timestamp: string
    omsLineItemId?: string
    omsSkuId?: string
    orderDate: string
    orderSourceSystem: string
    orderTargetSystem?: string
    transactionType: string
    originalOrderNumber?: string
    returnOrderNumber?: Object
    assocCommissionPin1?: string
    assocCommissionPin2?: string
    soldTo: SoldTo
    itemDetail: posOrder.LineItem
}

interface SoldTo {
  firstName: string
  lastName: string
}

@table(TABLE_NAME)
class ItemDetails implements PosItemDetails{
  @hashKey()
  orderId: string
  @rangeKey()
  timestamp: string;
  @attribute()
  omsLineItemId?: string
  @attribute()
  omsSkuId?: string
  @attribute()
  orderDate: string
  @attribute()
  orderSourceSystem: string
  @attribute()
  orderTargetSystem?: string
  @attribute()
  transactionType: string
  @attribute()
  originalOrderNumber?: string
  @attribute()
  returnOrderNumber?: Object
  @attribute()
  assocCommissionPin1?: string
  @attribute()
  assocCommissionPin2?: string
  @attribute()
  soldTo: SoldTo
  @attribute()
  itemDetail: posOrder.LineItem

  constructor(orderId?: string) {
    this.orderId = orderId || '';
  }
}

async function fetchAssociatePins(orderId: string, omsSkuId: string,  ddbMapper: DataMapper){
  const associatePins: string[] = [];
  try{
    logger.info({ message: `FetchAssociatePins for Orginial POS OrderID: ${orderId}` });
    const conditionExpression: ConditionExpression = {
      type: 'And',
      conditions: [
        {
          type: 'Equals',
          subject: 'omsSkuId',
          object: omsSkuId
        },
        {
          type: 'NotEquals',
          subject: 'transactionType',
          object: 'RETURN'
        }
      ]
    };
    const iterator = ddbMapper.query(
      ItemDetails,
      { orderId },
      { filter: conditionExpression }
    );
    for await (const item of iterator) {
      logger.debug({ message: `Inside Query Result Iterator.. - omsSkuId matched Item: (${omsSkuId})`, data: item });
      if (item && item.itemDetail.commissionableItem === 'Y') {
        if (item.itemDetail.assCommissionPin1) { associatePins.push(item.itemDetail.assCommissionPin1) };
        if (item.itemDetail.assCommissionPin2) { associatePins.push(item.itemDetail.assCommissionPin2) };
      }
    }
    return Promise.resolve([...new Set(associatePins)]);
  }
  catch (error){
    logger.error(
      {message: `Error fetching AssociatePins for OrginialOrderNumber: ${orderId}, and omsSKUId: ${omsSkuId} from POS-Order-Items table`, data: error})
    return Promise.resolve(associatePins);;
  }
}

async function batchWrite(PosItemDetailsList: PosItemDetails[], ddbMapper: DataMapper): Promise<PosItemDetails[]>{
  let actionArray: [WriteType, ItemDetails][] = [];
  for (let item of PosItemDetailsList) {
    actionArray.push(['put', Object.assign(new ItemDetails, removeEmpty(item))]);
  };
  const resultItemDetails: ItemDetails[] = [];
  for await (const actionItem of ddbMapper.batchWrite(actionArray)) {
    resultItemDetails.push(actionItem[1]);
    logger.info({message: `Persisted POS OrderItem details for OrderID -${actionItem[1].orderId} & TimeStamp -${actionItem[1].timestamp}`});
  };
  logger.debug({message: 'ResultItemDetails', data: resultItemDetails});
  return Promise.resolve(resultItemDetails)
  .catch(error => {
      logger.error({message: 'Error persisting POS Order Line Item details', data: error});
      throw new Error(error);
  });
}

async function updateItem(item: ItemDetails,  ddbMapper: DataMapper) {
  try {
    return await ddbMapper.update(item);
  } catch (error) {
    logger.error({ message: `Error updating original order:(${item.originalOrderNumber}) `
      + `with return order number:(${item.returnOrderNumber})`, data: error });
  }
}

async function query(orderId: string, ddbMapper: DataMapper, projection?: ProjectionExpression) {
  try {
    const iterator = ddbMapper.query(
      ItemDetails,
      { orderId },
      { projection }
    );

    const items: ItemDetails[] = [];

    for await (const item of iterator) {
        items.push(item);
    }

    return items;
  } catch (error) {
    logger.error({ message: `Error quering by order id:(${orderId})`, data: error });
    return [];
  }
}

export { batchWrite, fetchAssociatePins, PosItemDetails, updateItem, query }

