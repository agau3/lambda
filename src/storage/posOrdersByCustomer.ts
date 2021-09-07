import { DataMapper } from "@aws/dynamodb-data-mapper";
import { attribute, hashKey, rangeKey,table } from "@aws/dynamodb-data-mapper-annotations";
import { requireProperty } from "../util/conf";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME =requireProperty('POS_CUSTOMER_ORDERS_TABLE_NAME');

interface PosCustomerOrder {
  customerId: string
  timestamp: string
  orderId: string
  formattedOrderId?: string
  orderDate: string
  orderSourceSystem: string
  orderTargetSystem?: string  
  associatePin: string
  transactionType: string
  itemSKUs?: string[]
  totalAmount:string
  firstName: string
  lastName: string
}

@table(TABLE_NAME)
class CustomerOrder implements PosCustomerOrder {
  @hashKey()
  customerId: string
  @rangeKey()
  timestamp: string  
  @attribute()
  orderId: string
  @attribute()
  formattedOrderId?: string
  @attribute()
  orderDate: string
  @attribute()
  orderSourceSystem: string
  @attribute()
  orderTargetSystem?: string  
  @attribute()
  associatePin: string
  @attribute()
  transactionType: string
  @attribute()
  itemSKUs?: string[]
  @attribute()
  totalAmount: string
  @attribute()
  firstName: string
  @attribute()
  lastName: string

  constructor(customerId?: string) {
    this.customerId = customerId || ''
  }
}

async function put(orderEntry: PosCustomerOrder, ddbMapper: DataMapper): Promise<PosCustomerOrder> {
  return await ddbMapper.put(Object.assign(new CustomerOrder, removeEmpty(orderEntry)))
    .catch(error => {
      logger.error({message:`Error persisting POS Customer Order Details: ${orderEntry.customerId}`, data: error})
      throw new Error(error)
    })
}


export { put, PosCustomerOrder };
