import * as helperUtil from '../../util/helperUtil'
import * as cmosTestData from '../data/cmosTestData'
import * as posTestData from '../data/posTestData'

describe('Helper Util test', () => { 

    test('Test RemoveEmpty', async () => {
        let OrderDetails = helperUtil.removeEmpty(cmosTestData.processOrderPayload);
    })

    test('Test filter', async () => {
        let filteredObject = helperUtil.filter(posTestData.processOrderPayload);
    })
})