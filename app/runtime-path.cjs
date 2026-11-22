const path=require('node:path');
function dataRoot(){return process.env.BOLT_DATA_DIR?path.resolve(process.env.BOLT_DATA_DIR):path.resolve(__dirname,'../.app-runtime');}
const dataFile=(...parts)=>path.join(dataRoot(),...parts);
module.exports={dataRoot,dataFile};
