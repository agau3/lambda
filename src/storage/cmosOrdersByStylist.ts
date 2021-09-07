import { attribute, hashKey, table } from "@aws/dynamodb-data-mapper-annotations";
import { requireProperty } from "../util/conf";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME = requireProperty('CMOS_ASSOCIATE_ORDERS_TABLE_NAME')

interface CmosAssociateOrder {
  associatePin: string
  orderId: string
  timestamp: string
  orderDate: string
  orderSourceSystem: string
  orderTargetSystem?: string
  accountId: string
  firstName:string
  lastName:string
  totalAmount?: string
  itemSKUs?: string[] 
}

@table(TABLE_NAME)
class AssociateOrder implements CmosAssociateOrder {
  @hashKey()
  associatePin: string
  @attribute()
  orderId: string
  @attribute()
  timestamp: string
  @attribute()
  orderDate: string
  @attribute()
  orderSourceSystem: string
  @attribute()
  orderTargetSystem?: string  
  @attribute()
  accountId: string
  @attribute()
  firstName: string
  @attribute()
  lastName: string
  @attribute()
  totalAmount: string
  @attribute()
  itemSKUs?: [string]

  constructor(associatePin?: string) {
    this.associatePin = associatePin || ''
  }
}

async function put(orderEntry: CmosAssociateOrder, ddbMapper: DataMapper): Promise<CmosAssociateOrder> {
  return await ddbMapper.put(Object.assign(new AssociateOrder, removeEmpty(orderEntry)))
    .catch(error => {
      logger.error({message: `Error persisting the CMOS Associate Order details for EmployeePin: ${orderEntry.associatePin}`, data: error});
      throw new Error(error);
    })
}

export { put, CmosAssociateOrder };
