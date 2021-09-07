import { attribute, hashKey, table } from "@aws/dynamodb-data-mapper-annotations";
import { requireProperty } from "../util/conf";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME = requireProperty('CMOS_CUSTOMER_ORDERS_TABLE_NAME')

interface CmosCustomerOrder {
  customerId: string
  orderId: string
  timestamp: string
  orderDate: string
  orderSourceSystem: string
  orderTargetSystem?: string
  associatePin: string
  firstName: string
  lastName: string
  itemSKUs?: string[]
  totalAmount?: string
}

@table(TABLE_NAME)
class CustomerOrder implements CmosCustomerOrder {
  @hashKey()
  customerId: string
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
  associatePin: string
  @attribute()
  firstName: string
  @attribute()
  lastName: string
  @attribute()
  totalAmount: string
  @attribute()
  itemSKUs?: string[]
  
  constructor(customerId?: string) {
    this.customerId = customerId || ''
  }
}

async function put(orderEntry: CmosCustomerOrder, ddbMapper: DataMapper): Promise<CmosCustomerOrder> {
  return await ddbMapper.put(Object.assign(new CustomerOrder, removeEmpty(orderEntry)))
    .catch(error => {
      logger.error({message:`Error persisting CMOS Customer Order Details for ClientID: (${orderEntry.customerId})`, data: error})
      throw new Error(error)
    })
}

export {put, CmosCustomerOrder };