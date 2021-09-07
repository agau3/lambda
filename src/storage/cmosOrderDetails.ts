import * as cmosOrder from '../dto/cmosOrder';
import { attribute, hashKey, table } from "@aws/dynamodb-data-mapper-annotations";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { requireProperty } from "../util/conf";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME = requireProperty('CMOS_ORDER_DETAILS_TABLE_NAME')

interface CmosOrderDetails{
    omsOrderNumber: string
    lastUpdatedTimestamp: string
    orderDate: string;
    orderSourceSystem: string
    orderTargetSystem?: string
    orderHeader: cmosOrder.OrderHeader
    soldTo: cmosOrder.SoldTo[]
    payment: cmosOrder.PaymentDetails[]
    shipToCustomer: cmosOrder.ShipToDetails[];
}

@table(TABLE_NAME)
class OrderDetails implements CmosOrderDetails{
  @hashKey()
  omsOrderNumber: string
  @attribute()
  lastUpdatedTimestamp: string;
  @attribute()
  orderDate: string
  @attribute()
  orderSourceSystem: string
  @attribute()
  orderTargetSystem?: string
  @attribute()
  orderHeader: cmosOrder.OrderHeader
  @attribute()
  soldTo: cmosOrder.SoldTo[]
  @attribute()
  payment: cmosOrder.PaymentDetails[]
  @attribute()
  shipToCustomer: cmosOrder.ShipToDetails[]

  constructor(omsOrderNumber?: string) {
    this.omsOrderNumber = omsOrderNumber || ''
  }
}

async function put(orderEntry: CmosOrderDetails, ddbMapper: DataMapper): Promise<CmosOrderDetails> {
  if (orderEntry.shipToCustomer) {
    orderEntry.shipToCustomer.forEach(item => {
            delete item.lineItem;
    });
  }
  return await ddbMapper.put(Object.assign(new OrderDetails, removeEmpty(orderEntry)))
    .catch(error => {
      logger.error({message: `Error persisting CMOS OrderDetails for OrderID:(${orderEntry.omsOrderNumber})`, data: error});
      throw new Error(error)
    })
}

export { put, CmosOrderDetails}