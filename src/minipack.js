/* simple example
circular dependencies, caching module exports are skipped
*/

const fs = require('fs');
const path  = require('path');
const babylon = require('babylon');
const traverse = require('babel-traverse').default;
const { transformFromAst } = require('babel-core');

let ID = 0;

/* Start by creating a function that will accept a path to a file, read its contents and extract its dependencies */
function createAsset(filename) {
    // read the content of the file as a string
    const content = fs.readFileSync(filename, 'utf8');

    // figure out the dependencies, look at the import strings
    // Use javascript parsers to read and understand javascript code.
    const ast = babylon.parse(content, { sourceType: 'module' });

    // hold the relative paths of modules this module depends on
    const dependencies = [];

    // traverse the AST to find dependencies, check every import declaration
    traverse(ast, { 
        ImportDeclaration: ({node}) => {
            dependencies.push(node.source.value)
        }
    });

    // assign a unique identifier to this module by incrementing a simple counter
    const id = ID++;

    // use `babel-preset-env` to transpile our code to something that most browsers can run.
    const { code } = transformFromAst(ast, null, { presets: ['env'], });

    // return all information about this module
    return {
        id, 
        filename,
        dependencies,
        code
    }
}

/* extract the dependencies */
function createGraph(entry) {
    // parse the entry file
    const mainAsset = createAsset(entry);

    // use a queue to parse the dependencies of every asset
    const queue = [ mainAsset ]; 

    for (const asset of queue) {
        asset.mapping = {};

        // the directory this module is in
        const dirname = path.dirname(asset.filename);

        // iterate over the list of relative paths to its dependencies
        asset.dependencies.forEach(relativePath => {
            const absolutePath = path.join(dirname, relativePath);

            // Parse the asset, read its content, and extract its dependencies.
            const child = createAsset(absolutePath);

            asset.mapping[relativePath] = child.id;
            queue.push(child);
        })
    }

    return queue;
}

/* use our graph and return a bundle that can run in browser
the bundle will have just one self-invoking function

function will receive just one parameter: An object with information about every module in our graph.
*/
function bundle(graph) {
    let modules = '';

    graph.forEach(mod => {
        // { './relative/path': 1 }.
        modules += `${mod.id}: [
            function (require, module, exports) {
                ${mod.code}
            },
            ${JSON.stringify(mod.mapping)},
        ],`;
    });

    // implement the body of the self-invoking function
    const result = `
        (function(modules) {
            function require(id) {
            const [fn, mapping] = modules[id];
    
            function localRequire(name) {
                return require(mapping[name]);
            }
    
            const module = { exports : {} };
    
            fn(localRequire, module, module.exports);
    
            return module.exports;
            }
    
            require(0);
        })({${modules}})
    `;

    return result;
}

const graph = createGraph('./src/demo/test.js');
const result = bundle(graph);

console.log(result);