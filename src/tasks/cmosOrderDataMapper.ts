import { CmosOrderDetails } from '../storage/cmosOrderDetails';
import { CmosItemDetails } from '../storage/cmosItemDetails';
import { CmosAssociateOrder } from '../storage/cmosOrdersByStylist';
import { CmosCustomerOrder } from '../storage/cmosOrdersByCustomer';
import { CmosOrder } from '../dto/cmosOrder';
import logger from '@nmg/osp-backend-utils/logger';

class cmosOrderDataMapper {
    data: string;
    constructor(data) {
        this.data = data;
    }

}

async function buildOrderDetails(payload: CmosOrder): Promise<CmosOrderDetails> {
    let cmosOrderDetails: CmosOrderDetails = {
        omsOrderNumber: payload.eboPayload.OrderOut.orderHeader.id[0].omsOrderNumber,
        orderSourceSystem: payload.eboPayload.OrderOut.orderSourceSystem,
        orderTargetSystem: payload.eboPayload.OrderOut.orderTargetSystem,
        orderHeader: payload.eboPayload.OrderOut.orderHeader,
        soldTo: payload.eboPayload.OrderOut.soldTo,
        payment: payload.eboPayload.OrderOut.payment,
        shipToCustomer: payload.eboPayload.OrderOut.shipToCustomer,
        orderDate: formatOrderDate(payload.eboPayload.OrderOut.orderHeader.orderDate),
        lastUpdatedTimestamp: getCurrentDateTime()
    }
    logger.debug({ message: 'Built CMOS OrderDetails', data: cmosOrderDetails });
    return Promise.resolve(cmosOrderDetails);
}

async function buildOrderItemDetails(payload: CmosOrder): Promise<CmosItemDetails[]> {
    let cmosItemDetailsList: CmosItemDetails[] = [];
    let cmosItemDetails: CmosItemDetails;
    const orderNumber = payload.eboPayload.OrderOut.orderHeader.id[0].omsOrderNumber;
    const externalOrderNumber = payload.eboPayload.OrderOut.orderHeader.externalOrderNumber;
    const orderDate = formatOrderDate(payload.eboPayload.OrderOut.orderHeader.orderDate);
    const firstName = payload.eboPayload.OrderOut.soldTo[0].firstName;
    const lastName = payload.eboPayload.OrderOut.soldTo[0].lastName;
    const orderSourceSystem = payload.eboPayload.OrderOut.orderSourceSystem;
    const orderTargetSystem = payload.eboPayload.OrderOut.orderTargetSystem;
    const currentTimestamp = getCurrentDateTime();

    for (var i = 0; i < payload.eboPayload.OrderOut.shipToCustomer.length; i++) {
        if (payload.eboPayload.OrderOut.shipToCustomer[i].lineItem) {
            let itemArray = payload.eboPayload.OrderOut.shipToCustomer[i].lineItem;
            for (var index in itemArray) {
                var lineItem = itemArray[index];
                if (lineItem.omsLineItemId != null && lineItem.omsLineItemId != "") {
                    cmosItemDetails = {
                        omsOrderNumber: orderNumber,
                        omsLineItemId: lineItem.omsLineItemId,
                        itemDetail: lineItem,
                        orderDate: orderDate,
                        lastUpdatedTimestamp: currentTimestamp,
                        externalOrderId: externalOrderNumber,
                        firstName: firstName,
                        lastName: lastName,
                        orderSourceSystem: orderSourceSystem,
                        orderTargetSystem: orderTargetSystem
                    };
                    logger.debug({ message: 'Built CMOS OrderItemDetails', data: cmosItemDetails });
                    cmosItemDetailsList.push(cmosItemDetails);
                } else {
                    logger.debug({ message: `Build CMOSOrderItemDetails: shipToCustomer${i}.lineItem${index}.omsLineItemId: Is Empty !!!` });
                }
            }
        }
    }
    logger.debug({ message: 'Built CMOS OrderItemDetailsList', data: cmosItemDetailsList });
    return Promise.resolve(cmosItemDetailsList);
}

async function buildOrderDetailsbyAssociate(payload: CmosOrder): Promise<CmosAssociateOrder> {

    let skuList: string[] = [];
    if (payload.eboPayload.OrderOut.shipToCustomer[0].lineItem) {
        payload.eboPayload.OrderOut.shipToCustomer[0].lineItem.forEach(item => {
            if (item.omsSkuId)
                skuList.push(item.omsSkuId)
        });
    }
    let cmosAssociateOrder: CmosAssociateOrder = {
        associatePin: payload.eboPayload.OrderOut.orderHeader.employeePin,
        timestamp: getCurrentDateTime(),
        orderId: payload.eboPayload.OrderOut.orderHeader.id[0].omsOrderNumber,
        orderDate: formatOrderDate(payload.eboPayload.OrderOut.orderHeader.orderDate),
        orderSourceSystem: payload.eboPayload.OrderOut.orderSourceSystem,
        orderTargetSystem: payload.eboPayload.OrderOut.orderTargetSystem,
        accountId: payload.eboPayload.OrderOut.orderHeader.clientNumber,
        firstName: payload.eboPayload.OrderOut.soldTo[0].firstName,
        lastName: payload.eboPayload.OrderOut.soldTo[0].lastName,
        itemSKUs: skuList,
        totalAmount: calculateTotalAmount(payload)
    }
    logger.debug({ message: 'Built CMOS Associate Order Details', data: cmosAssociateOrder });
    return Promise.resolve(cmosAssociateOrder);
}

export function calculateTotalAmount(payload: CmosOrder): string {
    let totalAmount:number = 0;
    if(payload.eboPayload.OrderOut.shipToCustomer && payload.eboPayload.OrderOut.shipToCustomer.length>0){
        payload.eboPayload.OrderOut.shipToCustomer.forEach(shipment => {
            shipment.lineItem.forEach(item =>{
                totalAmount = totalAmount + ((+item.quantity) * ((+item.priceEach) + (+item.taxEach)+ (+item.freightEach)+ (+item.otherEach))) 
            })
        })
    }
    return totalAmount.toString();
}

async function buildOrderDetailsbyCustomer(payload: CmosOrder): Promise<CmosCustomerOrder> {
    let skuList: string[] = [];
    if (payload.eboPayload.OrderOut.shipToCustomer[0].lineItem) {
        payload.eboPayload.OrderOut.shipToCustomer[0].lineItem.forEach(item => {
            if (item.omsSkuId)
                skuList.push(item.omsSkuId)
        });
    }

    let cmosCustomerOrder: CmosCustomerOrder = {
        customerId: payload.eboPayload.OrderOut.soldTo[0].omsCustomerId,
        timestamp: getCurrentDateTime(),
        orderId: payload.eboPayload.OrderOut.orderHeader.id[0].omsOrderNumber,
        orderDate: formatOrderDate(payload.eboPayload.OrderOut.orderHeader.orderDate),
        orderSourceSystem: payload.eboPayload.OrderOut.orderSourceSystem,
        orderTargetSystem: payload.eboPayload.OrderOut.orderTargetSystem,
        associatePin: payload.eboPayload.OrderOut.orderHeader.employeePin,
        firstName: payload.eboPayload.OrderOut.soldTo[0].firstName,
        lastName: payload.eboPayload.OrderOut.soldTo[0].lastName,
        itemSKUs: skuList,
        totalAmount: calculateTotalAmount(payload)
    }
    logger.debug({ message: 'Built CMOS Customer Order Details', data: cmosCustomerOrder });
    return Promise.resolve(cmosCustomerOrder);
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

function getCurrentDateTime() {
    let date_ob = new Date();
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = date_ob.getHours();
    let minutes = date_ob.getMinutes();
    let seconds = date_ob.getSeconds();
    let milliSeconds = date_ob.getMilliseconds();
    let currentDateTime = year + "-" + month + "-" + date + " " + hours + ":" + minutes + ":" + seconds + ":" + milliSeconds;
    return currentDateTime;
}

function constructPosOrderId(omsOrderNumber: string) {
    //e.g:SO0020017705196041819
    if (omsOrderNumber) {
        let storeId = removeLeadingZeros(omsOrderNumber.substr(2, 3))
        let terminalId = removeLeadingZeros(omsOrderNumber.substr(5, 5))
        let transactionId = removeLeadingZeros(omsOrderNumber.substr(10, 5))
        let century = '20'
        let year = omsOrderNumber.substr(19, 2)
        let month = omsOrderNumber.substr(15, 2)
        let date = omsOrderNumber.substr(17, 2)
        let orderDate = century + year + month + date
        //2:177:5196:20190418
        return `${storeId}:${terminalId}:${transactionId}:${orderDate}`
    } else {
        return omsOrderNumber
    }
}
function removeLeadingZeros(input: string) {
    if (input && input.startsWith("0")) {
        return input.replace(/^0+/, '');
    } else {
        return input;
    }
}

export { cmosOrderDataMapper, buildOrderDetails, buildOrderDetailsbyAssociate, buildOrderDetailsbyCustomer, buildOrderItemDetails, constructPosOrderId };