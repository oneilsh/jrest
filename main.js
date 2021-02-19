#!/usr/bin/env node
var axios = require('axios')

var stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    inputChunks = [];

stdin.setEncoding('utf8');

stdin.on('data', function (chunk) {
    inputChunks.push(chunk);
});


async function callAxios(obj) {
  // falsy things are base cases, getting them out of the way
  if(!obj) { return obj }

  // this identifies primitive types, also base cases (https://stackoverflow.com/a/31538091)
  if(obj !== Object(obj)) { return obj }

  // if the given object is an {axios: true, url: "...", method: "...", ...} object, it's a base case and we want to call
  // axios() on it; returning either the result data or info about the error as an {"axiosError": ...} object
  if(obj.axios) {
    delete obj.axios
    try {
      var result = await axios(obj)
      if(result.status == 200) {
        return result.data
      } else {
        return {"axiosError": result}
      }
    } catch (e) {
      return {"axiosError": e}
    }
  }

  // ok, recurse
  for(var key in obj) {
    obj[key] = await callAxios(obj[key])
  }

  return obj
}

stdin.on('end', async function () {
    var inputJSON = inputChunks.join("")
    var input = JSON.parse(inputJSON)
    // we want to have an array of queries
    var mapped = await callAxios(input)
    console.log(JSON.stringify(mapped))

});
