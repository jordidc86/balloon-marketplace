import test from 'node:test'
import assert from 'node:assert/strict'
import {applySellerPriceCorrection} from '../src/utils/global-search/index.mjs'
const original={sourceId:'zebedee',url:'https://www.zebedeelist.co.uk/zebedee_list/ultramagic-h31/',registration:'G-DVCI',price:'£14,500'}
test('uses owner-confirmed price only for the exact stale advert',()=>{assert.equal(applySellerPriceCorrection(original).price,'£13,000');assert.equal(original.price,'£14,500');for(const change of [{price:'£12,000'},{registration:'G-OTHER'},{url:'https://www.zebedeelist.co.uk/zebedee_list/other/'},{sourceId:'balloons4sale'},{price:null}]){const item={...original,...change};assert.equal(applySellerPriceCorrection(item),item)}})
