import axios from "axios";

const BASE_URL = "https://oid-rep.orange-labs.fr/get";

export function fetchOID(oid: string) {
  return axios
    .get(`${BASE_URL}/${oid}`)
    .then(res => {
      if (res.data) {
        const dump = String(res.data)
          .slice(String(res.data).lastIndexOf("<code>") + 6)
          .split("</code>")[0]
          .replace(/"/g, "")
          .replace(/\n/g, " ");
        console.log(dump);

        // return {
        //   oid: oid,
        //   name: name,
        //   type: type,
        //   readable: readable,
        //   description: description.replace(/"/g,'').trim(),
        // };
      }
      return {};
    })
    .catch(err => {
      return {};
    });
}
