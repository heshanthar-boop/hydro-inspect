const path=require('node:path');
const esbuild=require('esbuild');
const root=path.join(__dirname,'..');
for(const [source,name] of [['ui/model.js','model.js'],['ui/operator.js','operator.js'],['vendor/chart.umd.js','chart.umd.js']]){
  esbuild.buildSync({entryPoints:[path.join(root,'android',source)],outfile:path.join(root,'android/app/src/main/assets',name),target:['chrome61'],minify:name==='chart.umd.js',legalComments:'inline',charset:'utf8'});
}
console.log('Packaged Android scripts compiled for Android 8-era WebViews.');
