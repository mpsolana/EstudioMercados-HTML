const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { rejectUnauthorized: false }, (resp) => {
            let data = '';
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => { 
                try { resolve(JSON.parse(data)); } catch(e) { resolve(data.substring(0, 500)); }
            });
        }).on("error", reject);
    });
}

(async () => {
    // 1. Test OECD
    console.log("Fetching OECD...");
    const oecdUrl = "https://stats.oecd.org/sdmx-json/data/DP_LIVE/USA.CLI.AMPLTD.M/all?json-lang=en";
    const oecdJson = await fetchUrl(oecdUrl);
    
    if (oecdJson.dataSets) {
        const obs = oecdJson.dataSets[0].observations;
        const timeDim = oecdJson.structure.dimensions.observation.find(d => d.id === 'TIME_PERIOD');
        console.log("OECD first 3 dates:", timeDim.values.slice(0, 3).map(v => v.name));
        const keys = Object.keys(obs).slice(0,3);
        console.log("OECD first 3 obs:", keys.map(k => obs[k][0]));
    } else {
        console.log("OECD returned non-standard SDMX:", oecdJson);
    }

    // 2. Test Eurostat (Unemployment EZ) - dataset: une_rt_m
    console.log("\nFetching Eurostat...");
    // ge0: EA20, s_adj: SA, age: TOTAL, sex: T, unit: PC_ACT (percentage of active pop)
    const euroUrl = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=EA20&s_adj=SA&age=TOTAL&sex=T&unit=PC_ACT";
    const euroJson = await fetchUrl(euroUrl);
    if (euroJson.value) {
        const timeIndex = euroJson.id.indexOf("time");
        const timeVals = Object.keys(euroJson.dimension.time.category.index);
        console.log("Eurostat first 3 dates:", timeVals.slice(0, 3));
        console.log("Eurostat first 3 obs:", Object.keys(euroJson.value).slice(0,3).map(k => euroJson.value[k]));
    } else {
        console.log("Eurostat structure weird:", euroJson);
    }

})();
