import { attribute, hashKey, table, rangeKey } from "@aws/dynamodb-data-mapper-annotations";
import { requireProperty } from "../util/conf";
import { DataMapper } from "@aws/dynamodb-data-mapper";
import { WriteType } from "@aws/dynamodb-data-mapper";
import { removeEmpty } from '../util/helperUtil';
import logger from '@nmg/osp-backend-utils/logger';

const TABLE_NAME = requireProperty('ONLINE_SALE_ACTION_TABLE_NAME')

interface CmosAssociateOnlineSale {
    associatePin: string
    actionKey: string
    totalAmount: number
    cmosOrderNumber: string
    externalOrderNumber: string
    orderDate?: string  
    cmosLineItemId: string
    externalLineItemId: string
    pimSkuId: string
    quantity: string
    source: string
    firstName: string
    lastName: string
    currentStatus: string
    currentStatusDate: string
    subStatus: string | null;
    subStatusDateTime: string | null;
}

@table(TABLE_NAME)
class AssociateOnlineSale implements CmosAssociateOnlineSale {
  @hashKey()
  associatePin: string
  @rangeKey()
  actionKey: string
  @attribute()
  totalAmount: number
  @attribute()
  cmosOrderNumber: string
  @attribute()
  externalOrderNumber: string
  @attribute()
  orderDate?: string 
  @attribute()
  cmosLineItemId: string
  @attribute()
  externalLineItemId: string
  @attribute()
  pimSkuId: string
  @attribute()
  quantity: string
  @attribute()
  source: string
  @attribute()
  firstName: string
  @attribute()
  lastName: string
  @attribute()
  currentStatus: string
  @attribute()
  currentStatusDate: string
  @attribute()
  subStatus: string
  @attribute()
  subStatusDateTime: string

  constructor(associatePin?: string, actionKey?: string) {
    this.associatePin = associatePin || '';
    this.actionKey = actionKey || '';
  }
}

async function batchWrite(cmosAssociateOnlineSaleList: CmosAssociateOnlineSale[], ddbMapper: DataMapper) {
    let actionArray: [WriteType, AssociateOnlineSale][] = [];
    try {
        for (let item of cmosAssociateOnlineSaleList) {
          actionArray.push(['put', Object.assign(new AssociateOnlineSale, removeEmpty(item))]);
        }
        const result: AssociateOnlineSale[] = [];
        for await (const actionItem of ddbMapper.batchWrite(actionArray)) { 
            result.push(actionItem[1]);
          logger.info({message: `Persisted Online Sale Action details for AssocPIN: ${actionItem[1].associatePin} & ActionKey:${actionItem[1].actionKey}`});
        }
        logger.debug({message: 'ResultItemDetails', data: result});
        return result;
    } catch (error) {
        logger.error({message: 'Error persisting CMOS Associate Online Sale Action details', data: error});
        throw new Error(error);
    }
  }

export { batchWrite, CmosAssociateOnlineSale}
