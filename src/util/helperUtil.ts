
export function removeEmpty(obj: Object) {
    Object.keys(obj).forEach(key => {
        if (obj[key] && typeof obj[key] === "object") {
            removeEmpty(obj[key]);
        } else if (obj[key] === null || obj[key] === undefined || obj[key] === '') {
            obj[key] = undefined;
        }
      });
    return obj;
}

export function filter(obj: Object) {
    for(let key in obj){
        if (obj[key] === "" || obj[key] === null){
            delete obj[key];
        } else if (Object.prototype.toString.call(obj[key]) === '[object Object]') {
                filter(obj[key]);
        } else if (Array.isArray(obj[key])) {
            if(obj[key].length == 0){
                delete obj[key];
            }else{
                for(let _key in obj[key]){
                    filter(obj[key][_key]);
                }
                obj[key] = obj[key].filter(value => Object.keys(value).length !== 0);
                if(obj[key].length == 0){
                    delete obj[key];
                }
            }
        }   
    }
};

export const cleanEmpty = (obj: any) => {
    if (Array.isArray(obj)) {
        return obj
            .map(v => (v && typeof v === 'object') ? cleanEmpty(v) : v)
            .filter(v => !(isEmpty(v)));
    } else {
        return Object.entries(obj)
            .map(([k, v]) => [k, v && typeof v === 'object' ? cleanEmpty(v) : v])
            .reduce((a, [k, v]) => (isEmpty(v) ? a : {...a, [k]: v}), {});
    }
};

const isEmpty = (val: any) =>
    val === null || val === undefined || val === '';