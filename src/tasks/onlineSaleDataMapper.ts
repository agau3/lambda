import { CmosAssociateOnlineSale } from '../storage/onlineSaleAction';
import { CmosOrder, LineItem } from '../dto/cmosOrder';
import { isEmpty } from "lodash";
import logger from '@nmg/osp-backend-utils/logger';

class onlineSaleDataMapper {
    data: string;
    constructor(data) {
        this.data = data;
    }
}

const ConnectVendorId: string[] = ["NMVSM", "NMVIP", "NMDSM", "NMSCA", "NMSGM", "NMDCA", "NMCONNECT", "BGSCA", "BGSGM", "BGDSM", "BGCONNECT"];
enum ActionType {
    ProductBought = "PB",
    ProductShipped = "PS",
    ProductReturned = "PR"
}
const CMOS_SYSTEM_CODE = "CM";
const WEB_BG_SYSTEM_CODE = "WB";
const WEB_NM_SYSTEM_CODE = "WN";

const SYSTEMS = { WB: 'BG', WN: 'NM', CM: 'CMOS' };

const READY_FOR_PRINT_STATUS = "RP";
const READY_FOR_DROP_SHIP = "RD";
const VERIFIED_SHIPPED_STATUS = "VS";
const RETURN_STATUS = "RT";
const RETURN_NEVER_STATUS = "RN";
const PARCEL_LOST_STATUS = "PL";
const PARCEL_DAMAGED_STATUS = "PD";
const CANCEL_STATUS = "CX";
const RETURN_STATUSES = [RETURN_STATUS, RETURN_NEVER_STATUS, PARCEL_LOST_STATUS, PARCEL_DAMAGED_STATUS, CANCEL_STATUS];

const DELIMITER = "#";

async function buildOnlineSaleDetails(payload: CmosOrder): Promise<CmosAssociateOnlineSale[]> {
    if (!isOrderMessageAppropriate(payload)) {
        logger.info({ message: 'buildOnlineSaleDetails isOrderMessageAppropriate', data: false});
        return [];
    }
    let associateOnlineSaleList: CmosAssociateOnlineSale[] = [];
    try {
        for (const shipToCostumer of payload.eboPayload.OrderOut.shipToCustomer) {
            if (shipToCostumer.lineItem) {
                let lineItemWithReturn: string[] = [];
                for (const lineItem of shipToCostumer.lineItem) {
                    let amountPart = 0;
                    let associatePins = (lineItem.commissionId!=null)? parseCommissionIds(lineItem.commissionId): null;
                    if (associatePins !== null && associatePins.length > 0 && associatePins !== undefined) {
                        logger.info({ message: 'Commission AssociatePins', data: associatePins });
                        for (const assocPin of associatePins) {
                            amountPart = (parseFloat(lineItem.priceEach) * parseInt(lineItem.quantity)) / associatePins.length;
                            logger.debug({ message: 'Commission AmountPart', data: amountPart });
                            let associateOnlineSale = await mapLineItem(payload, lineItem, assocPin, amountPart, lineItemWithReturn)
                            logger.debug({ message: 'associateOnlineSale', data: associateOnlineSale });
                            if (associateOnlineSale !== undefined && !isEmpty(associateOnlineSale)) {
                                associateOnlineSaleList.push(associateOnlineSale);
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.error({ message: 'Error buildling Online Sales Action Details', data: error });
    }
    logger.debug({ message: 'Built OnlineSalesAction List', data: associateOnlineSaleList });
    return Promise.resolve(associateOnlineSaleList);
}

async function mapLineItem(payload: CmosOrder, lineItem: LineItem, assocPin: string, amount: number, lineItemWithReturn: string[]) {
    logger.debug({ message: 'mapLineItem - buildOnlineSaleDetails' });
    let onlineSaleAction: CmosAssociateOnlineSale;
    const cmosOrderNumber = payload.eboPayload.OrderOut.orderHeader.id[0].omsOrderNumber;
    const externalOrderNumber = payload.eboPayload.OrderOut.orderHeader.externalOrderNumber;
    const orderDate = formatOrderDate(payload.eboPayload.OrderOut.orderHeader.orderDate);
    logger.debug({ message: 'mapLineItem - Formatted orderDate', data: orderDate});
    const currentStatus = lineItem.currentStatus;
    logger.debug({ message: 'mapLineItem - currentStatus', data: currentStatus});

    let actionType = null;
    if (READY_FOR_PRINT_STATUS === currentStatus || READY_FOR_DROP_SHIP === currentStatus) {
        actionType = ActionType.ProductBought;
    } else if (VERIFIED_SHIPPED_STATUS === currentStatus) {
        actionType = ActionType.ProductShipped;
    } else if (RETURN_STATUSES.includes(currentStatus)) {
        actionType = ActionType.ProductReturned;
    }
    logger.info({ message: 'mapLineItem - ActionType', data: actionType});
    if (actionType != null) {
        const externalLineItemId = lineItem.externalLineItemId;
        const cmosLineItemId = lineItem.omsLineItemId;
        if (actionType === "PR") {
            if (lineItemWithReturn.includes(cmosLineItemId)) {
                logger.warn({ message: `Line item with cmosLineItemId \"${cmosLineItemId}\" has more than 1 action with \"returned\" status."
                    + " Only the first one will be stored.`});
                return;
            } else {
                lineItemWithReturn.push(cmosLineItemId);
                logger.debug({ message: 'mapLineItem - lineItemWithReturn', data: lineItemWithReturn});
            }
        }

        const currentStatusDate = formatOrderDate(lineItem.currentStatusDate);
        const actionKey = actionType + DELIMITER + currentStatusDate + DELIMITER + cmosLineItemId;
        logger.info({ message: 'mapLineItem - actionKey', data: actionKey});

        onlineSaleAction = {
            associatePin: assocPin,
            actionKey: actionKey,
            totalAmount: amount,
            cmosOrderNumber: cmosOrderNumber,
            externalOrderNumber: externalOrderNumber,
            orderDate: orderDate,
            cmosLineItemId: cmosLineItemId,
            externalLineItemId: externalLineItemId,
            pimSkuId: lineItem.pimSkuId,
            quantity: lineItem.quantity,
            source: getOrderSource(payload),
            firstName: payload.eboPayload.OrderOut.soldTo[0].firstName,
            lastName: payload.eboPayload.OrderOut.soldTo[0].lastName,
            currentStatus: currentStatus,
            currentStatusDate: currentStatusDate,
            subStatus: lineItem?.subStatusDesc || null,
            subStatusDateTime: lineItem?.subStatusDateTime || null,
        }
    }
    logger.debug({ message: 'mapLineItem - onlineSaleAction', data: onlineSaleAction});
    return onlineSaleAction;
}

function getOrderSource(payload: CmosOrder): string {
    const targetSystem = payload.eboPayload.OrderOut.orderTargetSystem;
    return SYSTEMS[targetSystem.toUpperCase()];
}

function isOrderMessageAppropriate(orderMessage: CmosOrder) {
    return (CMOS_SYSTEM_CODE === orderMessage.eboPayload.OrderOut.orderSourceSystem
        && (WEB_BG_SYSTEM_CODE === orderMessage.eboPayload.OrderOut.orderTargetSystem ||
            WEB_NM_SYSTEM_CODE === orderMessage.eboPayload.OrderOut.orderTargetSystem)
        && orderMessage.eboPayload.OrderOut != null
        && orderMessage.eboPayload.OrderOut.shipToCustomer != null
        && isConnectOrder(orderMessage));
}

function isConnectOrder(orderMessage: CmosOrder) {
    if (ConnectVendorId.includes((orderMessage.eboPayload.OrderOut.orderHeader.vendorId).toUpperCase())) {
        logger.debug({ message: 'isConnectOrder', data: true});
        return true;
    }
    else {
        logger.debug({ message: 'isConnectOrder', data: false});
        return false;
    }
}

export function formatOrderDate(orderDate: string) {
    if (orderDate) {
        let month = orderDate.slice(0, 2);
        let date = orderDate.slice(3, 5);
        let year = orderDate.slice(6)
        let currentDateTime = year + '-' + month + '-' + date;
        return currentDateTime;
    }
    return getCurrentDate()
}

function getCurrentDate() {
    let date_ob = new Date();
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let currentDateTime = year + "-" + month + "-" + date;
    return currentDateTime;
}

function parseCommissionIds(commissionIds: string) {
    let associatePins: string[] = [];
    if (commissionIds.includes(",")) {
        let pins = commissionIds.split(',');
        for (const pin of pins) {
            associatePins.push(removeLeadingZeros(pin));
        }
        return associatePins;
    }
    associatePins.push(removeLeadingZeros(commissionIds));
    logger.debug({ message: 'mapLineItem - parseCommissionIds', data: associatePins});
    return associatePins;
}

function removeLeadingZeros(input: string) {
    logger.debug({ message: 'mapLineItem - removeLeadingZeros', data: input});
    if (input && input.startsWith("0")) {
        return input.replace(/^0+/, '');
    } 
    return input;
}

export { onlineSaleDataMapper, buildOnlineSaleDetails }