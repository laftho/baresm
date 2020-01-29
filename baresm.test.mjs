global.self = {
  addEventListener: () => {}
};

//import { repath } from "./baresm.mjs";

export const bareModuleSpecifiersRegex = /import\s+.*\s+from\s+(['"][^./].*['"]);/g;

export function repath(body) {
  return body.replace(bareModuleSpecifiersRegex, (match, module) => {
    const quote = module[0];
    return match.replace(module, `${quote}/node_modules/${module.slice(1, -1)}${quote}`);
  });
}


const js = `
import { a, b, c } from "./dep.js";
import { d } from "test-module";

import asdf from 'foo';
import zxcv from "foo";
import { a, b, c } from "bar";

import
azxcv
from
'zx';


a();
b();
c();
d();
`;

console.log(repath(js));

