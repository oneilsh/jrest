# jrest

`jrest` is a small wrapper around the [`axios`](https://www.npmjs.com/package/axios) npm library for making REST calls from the command-line, formatted as JSON
read on stdin. It works best when paired with the amazing [`jq`](https://github.com/stedolan/jq/wiki) utility for JSON slicing and dicing.

It operates like a deep map, looking for objects in the input with an `axios` property; when it find them it assumes the object is formatted as an `axios` [config](https://www.npmjs.com/package/axios#axios-api)
object for making REST calls, and replaces the object with the result of the call (or an `{axiosError: ...}` object if the call didn't succeed with status 200).

```
{"this": "is", "some": "json", "replaceme": {"axios": true, "method": "get", "url": "http://some.api"}}
  =>
{"this": "is", "some": "json", "replaceme": <DATA returned by http://some.api>}
```

Since axios is used under the hood, the request object can specify headers, method (POST, GET, PUT, etc.), data (for POST et al.), params, and so on.

## Known Issues

`jrest` is very simple: it only reads valid JSON on standard input, only outputs JSON to standard output, and has no other options. It doesn't have `--version` and `--help` flags yet. 

## Install

To install into your home `local` folder:

```
mkdir -p $HOME/local/lib
mkdir -p $HOME/local/bin
npm install --prefix=$HOME/local @oneilsh/jrest
```

Don't forget to add `$HOME/local/bin` to your `$PATH` :)

## Example: COVID-19 -> Associated Genes -> Associated Phenotypes

For an example, let's look for genes suspected to be associated with COVID-19 ([MONDO:0100096](https://monarchinitiative.org/disease/MONDO:0100096) from the Monarch Initiative API), querying the `/api/bioentity/disease` endpoint with some params to keep the output small; we build the query and send it to `jrest`, then send the result to `jq` for nice output formatting.

```
echo '{"axios": true,
       "method": "get",
       "url": "https://api.monarchinitiative.org/api/bioentity/disease/MONDO:0100096/genes",
       "params": {"unselect_evidence": true}}' |\
  jrest |\
  jq
```

The result lists genes associated with the disease. We've hidden a bunch of output fields with `...` to save space, the `object` id and label fields are what we're interested in:

```
{
  "associations": [
    {
      "id": "16a26193-cf36-46d7-a53b-2b1ab7302716",
      ...
      "object": {
        "taxon": {
          "id": "NCBITaxon:9606",
          "label": "Homo sapiens"
        },
        "id": "HGNC:79",
        "label": "ABO",
        "iri": "https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/HGNC:79",
        "category": [
          "gene"
        ]
      },
      ...
    },
    {
      "id": "f1e30951-566a-4c05-9b63-f4004a1f3b6e",
      ...
      "object": {
        "taxon": {
          "id": "NCBITaxon:9606",
          "label": "Homo sapiens"
        },
        "id": "HGNC:6741",
        "label": "LZTFL1",
        "iri": "https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/HGNC:6741",
        "category": [
          "gene"
        ]
      },
      ...
    }
  ],
  "compact_associations": null,
  ...
}
```

We can modify the `jq` at the end to clean it up:

```
echo '{"axios": true,
       "method": "get",
       "url": "https://api.monarchinitiative.org/api/bioentity/disease/MONDO:0100096/genes",
       "params": {"unselect_evidence": true}}' |\
  jrest |\
  jq '.associations[] | {gene: .object.id, label: .object.label}'
```

Result:

```
{
  "gene": "HGNC:79",
  "label": "ABO"
}
{
  "gene": "HGNC:6741",
  "label": "LZTFL1"
}
```

Instead of just using `jq` to just filter the output, let's use it to format a set of embedded REST queries, identifying the phenotypes known to be associated with each gene. We wrap the whole expression in `[]` to ensure a single valid JSON object is output (an array), rather than the stream of objects as above, a requirement for `jrest`.

(`jq` syntax is complex; this [tutorial](https://programminghistorian.org/en/lessons/json-and-jq) at The Programming Historian is pretty good. The Programming Historian is awesome all around.)

```
echo '{"axios": true,
       "method": "get",
       "url": "https://api.monarchinitiative.org/api/bioentity/disease/MONDO:0100096/genes",
       "params": {"unselect_evidence": true}}' |\
  jrest |\
  jq '[.associations[] | {
                          gene: .object.id,
                          label: .object.label,
                          phenotypes: {
                            axios: true,
                            url: "https://api.monarchinitiative.org/api/bioentity/gene/\(.object.id)/phenotypes",
                            params: {unselect_evidence: true}
                          }
                        }]'
```

Resulting in JSON with embedded requests:

```
[
  {
    "gene": "HGNC:79",
    "label": "ABO",
    "phenotypes": {
      "axios": true,
      "url": "https://api.monarchinitiative.org/api/bioentity/gene/HGNC:79/phenotypes",
      "params": {
        "unselect_evidence": true
      }
    }
  },
  {
    "gene": "HGNC:6741",
    "label": "LZTFL1",
    "phenotypes": {
      "axios": true,
      "url": "https://api.monarchinitiative.org/api/bioentity/gene/HGNC:6741/phenotypes",
      "params": {
        "unselect_evidence": true
      }
    }
  }
]
```

And we can send that to `jrest | jq` for converting the internal requests and formatting. Here are just the first few lines of the very long output with some output hidded behind `...`:

```
[
  {
    "gene": "HGNC:79",
    "label": "ABO",
    "phenotypes": {
      "associations": [
        {
          ...
          "object": {
            "taxon": {
              "id": null,
              "label": null
            },
            "id": "EFO:0004611",
            "label": "low density lipoprotein cholesterol measurement",
            "iri": "http://www.ebi.ac.uk/efo/EFO_0004611",
            "category": [
              "phenotype"
            ]
          },
          "relation": {
            "inverse": false,
            "id": "RO:0003304",
            "label": "contributes to condition",
            "iri": "http://purl.obolibrary.org/obo/RO_0003304",
            "category": null
          },
          ...
```

Each request object has been replaced with the result of the call; now we have a list of `gene` objects, each with a `phenotypes` sub-object, containing
a list of `associations` - each association has an `object` (the phenotype, with label and id) and a relation type (e.g. "contributes to condition"). Let's pull just that info with `jq`; here's the full pipeline:

```
echo '{"axios": true,
       "method": "get",
       "url": "https://api.monarchinitiative.org/api/bioentity/disease/MONDO:0100096/genes",
       "params": {"unselect_evidence": true}}' |\
  jrest |\
  jq '[.associations[] | {
                          gene: .object.id,
                          label: .object.label,
                          phenotypes: {
                            axios: true,
                            url: "https://api.monarchinitiative.org/api/bioentity/gene/\(.object.id)/phenotypes",
                            params: {unselect_evidence: true}
                          }
                        }]' |\
  jrest |\
  jq '[ .[] |
        {gene: .gene,
         label: .label,
         phenotypes: .phenotypes.associations |
         map_values({
           relationship: .relation.label,
           phenotype: .object.label,
           phenotypeId: .object.id}
         )}
      ]'
```

And the first few lines of result:

```
[
  {
    "gene": "HGNC:79",
    "label": "ABO",
    "phenotypes": [
      {
        "relationship": "contributes to condition",
        "phenotype": "low density lipoprotein cholesterol measurement",
        "phenotypeId": "EFO:0004611"
      },
      {
        "relationship": "contributes to condition",
        "phenotype": "intraocular pressure measurement",
        "phenotypeId": "EFO:0004695"
      },
      {
        "relationship": "contributes to condition",
        "phenotype": "von Willebrand factor measurement",
        "phenotypeId": "EFO:0004629"
      },
```
