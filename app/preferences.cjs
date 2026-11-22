const {JsonStore}=require('./storage.cjs'),{dataFile}=require('./runtime-path.cjs');
require('../extension/core.js');
class Preferences{
 constructor({file=dataFile('preferences.json')}={}){this.store=new JsonStore(file,{});}
 read(){return this.store.read();}
 async save(input){return this.store.update(data=>{const C=globalThis.ChatterCore,settings=C.settings({model:'qwen3:4b',...data.settings,...input});data.settings=Object.fromEntries(Object.keys(C.defaults).map(key=>[key,settings[key]]));data.updatedAt=Date.now();return structuredClone(data);});}
}
module.exports={Preferences};
