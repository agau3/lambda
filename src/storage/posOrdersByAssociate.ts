import { attribute, hashKey, rangeKey, table } from "@aws/dynamodb-data-mapper-annotations";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { requireProperty } from "../util/conf";
import { WriteType } from "@aws/dynamodb-data-mapper";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME =requireProperty('POS_ASSOCIATE_ORDERS_TABLE_NAME');

interface PosAssociateOrder {
  associatePin: string
  timestamp: string
  orderId: string
  formattedOrderId?: string
  omsSkuId: string
  orderDate: string
  orderSourceSystem: string
  orderTargetSystem?: string  
  accountId: string
  transactionType: string
  totalOrderAmount:string
  itemReturnsAmount?:number
  itemSalesAmount?:number
  itemQuantity: string
  firstName:string
  lastName:string
  orderTransactionType:string
  commissionableItem?:string
  serviceFlag?:string
}


@table(TABLE_NAME)
class AssociateOrder implements PosAssociateOrder {
  @hashKey()
  associatePin: string
  @rangeKey()
  timestamp: string
  @attribute()
  orderId: string
  @attribute()
  formattedOrderId?: string
  @attribute()
  omsSkuId: string
  @attribute()
  orderDate: string
  @attribute()
  orderSourceSystem: string
  @attribute()
  orderTargetSystem?: string  
  @attribute()
  accountId: string
  @attribute()
  transactionType: string
  @attribute()
  totalOrderAmount:string
  @attribute()
  itemReturnsAmount?:number
  @attribute()
  itemSalesAmount?:number
  @attribute()
  itemQuantity: string
  @attribute()
  firstName:string
  @attribute()
  lastName:string
  @attribute()
  orderTransactionType:string
  @attribute()
  serviceFlag?:string
  @attribute()
  commissionableItem?:string

  constructor(associatePin?: string) {
    this.associatePin = associatePin || ''
  }
}

async function batchWrite(posAssociateOrderList: PosAssociateOrder[], ddbMapper: DataMapper){
  let actionArray: [WriteType, AssociateOrder][] = [];
  try {
      for (let item of posAssociateOrderList) {
        actionArray.push(['put', Object.assign(new AssociateOrder, removeEmpty(item))]);
      };
      const resultAssocItemDetails: AssociateOrder[] = [];
      for await (const actionItem of ddbMapper.batchWrite(actionArray)) { 
        resultAssocItemDetails.push(actionItem[1]);
        logger.info({message: `Persisted POS Associate OrderItem details for AssocPin-${actionItem[1].associatePin} & TimeStamp -${actionItem[1].timestamp}`});
      };
      logger.debug({message: 'Associate resultItemDetails', data: resultAssocItemDetails});
      return resultAssocItemDetails;
  } catch (error) {
      logger.error({message:'error persisting the Pos Associate Order Line Item details', data: error});
      throw error;
  }
}

export { batchWrite, PosAssociateOrder};
