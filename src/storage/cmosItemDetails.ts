import * as cmosOrder from '../dto/cmosOrder';
import { attribute, hashKey, rangeKey, table } from "@aws/dynamodb-data-mapper-annotations";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { requireProperty } from "../util/conf";
import { WriteType } from "@aws/dynamodb-data-mapper";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME = requireProperty('CMOS_ITEM_DETAILS_TABLE_NAME')

interface CmosItemDetails{
    omsOrderNumber: string
    omsLineItemId: string
    lastUpdatedTimestamp: string
    orderDate: string
    externalOrderId: string
    firstName: string
    lastName: string
    orderSourceSystem?: string
    orderTargetSystem?: string
    itemDetail: cmosOrder.LineItem
}

@table(TABLE_NAME)
class ItemDetails implements CmosItemDetails{
  @hashKey()
  omsOrderNumber: string
  @rangeKey()
  omsLineItemId: string
  @attribute()
  lastUpdatedTimestamp: string;
  @attribute()
  orderDate: string
  @attribute()
  externalOrderId: string
  @attribute()
  firstName: string
  @attribute()
  lastName: string
  @attribute()
  orderSourceSystem?: string
  @attribute()
  orderTargetSystem?: string
  @attribute()
  itemDetail: cmosOrder.LineItem
  
  constructor(omsOrderNumber?: string, omsLineItemId?: string) {
    this.omsOrderNumber = omsOrderNumber || '';
    this.omsLineItemId = omsLineItemId || '';
  }
}

async function batchWrite(CmosItemDetailsList: CmosItemDetails[], ddbMapper: DataMapper) {
  let actionArray: [WriteType, ItemDetails][] = [];
  try {
      for (let item of CmosItemDetailsList) {
        actionArray.push(['put', Object.assign(new ItemDetails, removeEmpty(item))]);
      }
      const resultItemDetails: ItemDetails[] = [];
      for await (const actionItem of ddbMapper.batchWrite(actionArray)) { 
        resultItemDetails.push(actionItem[1]);
        logger.info({message: `Persisted POS OrderItem details for LineItemID - ${actionItem[1].omsLineItemId}`});
      }
      logger.debug({message: 'ResultItemDetails', data: resultItemDetails});
      return resultItemDetails;
  } catch (error) {
      logger.error({message: 'Error persisting CMOS Order Line Item details', data: error});
      throw new Error(error);
  }
}

export { batchWrite, CmosItemDetails}

