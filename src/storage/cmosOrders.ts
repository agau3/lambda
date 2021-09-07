import { DataMapper, WriteType } from '@aws/dynamodb-data-mapper';
import { attribute, hashKey, table } from '@aws/dynamodb-data-mapper-annotations';
import { DynamoDB } from 'aws-sdk';
import logger from '@nmg/osp-backend-utils/logger';
import { property } from '@nmg/osp-backend-utils/config';
import {
    CmosOrderOut,
    OrderHeader,
    PaymentDetails,
    ShipToDetails,
    SoldTo
} from '../dto/cmosOrder';
import { AssumeRoleResponse } from 'aws-sdk/clients/sts';
import { cleanEmpty } from '../util/helperUtil';

const CMOS_ORDERS_TABLE_NAME = property('CMOS_ORDERS_TABLE_NAME');

export interface CmosOrder extends CmosOrderOut {
    omsOrderNumber: string;
    externalOrderNumber?: string;
    orderDate: string;
    omsCustomerId?: string;
    associatePin?: string;
}

@table(CMOS_ORDERS_TABLE_NAME)
class Order implements CmosOrder {
    @hashKey()
    omsOrderNumber: string;
    @attribute()
    externalOrderNumber?: string;
    @attribute()
    omsCustomerId?: string;
    @attribute()
    associatePin?: string;
    @attribute()
    orderDate: string;
    @attribute()
    orderSourceSystem?: string;
    @attribute()
    orderTargetSystem?: string;
    @attribute()
    orderHeader: OrderHeader;
    @attribute()
    soldTo: SoldTo[];
    @attribute()
    payment: PaymentDetails[];
    @attribute()
    shipToCustomer: ShipToDetails[];

    constructor(omsOrderNumber?: string) {
        this.omsOrderNumber = omsOrderNumber || '';
    }
}

export class CmosOrderStorage {
    readonly mapper: DataMapper = new DataMapper(
        {
          client: new DynamoDB({
            accessKeyId: this.credentials.Credentials.AccessKeyId,
            secretAccessKey: this.credentials.Credentials.SecretAccessKey,
            sessionToken: this.credentials.Credentials.SessionToken
          })
        },
      );
    
    constructor(private credentials: AssumeRoleResponse) {
    }

    async batchWrite(orders: CmosOrder[]): Promise<void> {
        try {
            const batch: [WriteType, CmosOrder][] = orders
                .map(order => ['put', Object.assign(new Order, cleanEmpty(order))]);
            
            for await (const item of this.mapper.batchWrite(batch)) { 
                logger.info({ message: `Successfully persisted '${item[1].omsOrderNumber}' order.` });
            }
        } catch (exception) {
            logger.error({ message: 'Error persisting order', data: exception });
            throw exception;
        }
    }

    async put(order: CmosOrder): Promise<CmosOrder> {
        try {
            return await this.mapper.put(Object.assign(new Order, cleanEmpty(order)));
        } catch (exception) {
            logger.error({ message: 'Error persisting order', data: exception });
            throw exception;
        }
    }
}