'use strict'
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const compression = require('compression')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const app = express()
const axios = require('axios');
const sortBy = require('lodash.sortby');

const swapiApi = 'https://swapi.co/api'

app.set('view engine', 'ejs')
app.use(compression())
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(awsServerlessExpressMiddleware.eventContext())

// get all objects up to the limit, using the pagination provided by the api.
// returns a promise that resolves to an array of objects up to the limit
function getAllObjects(url, limit, array) {
  if(!array) array = [];
  return axios(url)
  .then(result => {
    array.push(...result.data.results);
    if(array.length >= limit || result.data.next === null) {
      return array;
    } else {
      return getAllObjects(result.data.next, limit, array);
    }
  })
}

app.get('/character/:name', (req, res) => {
  if (!req.params.name) res.render('index', {page: 'No name given in URL'});

  getAllObjects(`${swapiApi}/people/?search=${encodeURIComponent(req.params.name)}`, 50)
  .then(result => {
    res.render('index', {
      results: result
    })
  })
  .catch(err => {
    res.render('index', {
      error: err
    })
  });
})

app.get('/characters', (req, res) => {
  getAllObjects(`${swapiApi}/people`, 50)
  .then(characters => {
    let sorted = [];
    if(req.query.hasOwnProperty("sort")) {
      sorted = sortBy(characters, char => {
        if(req.query.sort !== "name") {
          return parseFloat(char[req.query.sort].replace(",", ""));
        } else {
          return char.name;
        }
      });
    } else {
      sorted = characters;
    }
    return res.json(sorted);    
  })
  .catch(err => res.json({error: err.message}));
})

app.get('/planetresidents', (req, res) => {
  const planets = {};
  getAllObjects(`${swapiApi}/planets`, 100)
  .then(results => {
    return axios.all(results.map(planet => {
      planets[planet.url] = {
        name: planet.name,
        residents: []
      };
      return axios.all(planet.residents.map(resident => {
        return axios.get(resident)
        .then(residentResult => {
          planets[residentResult.data.homeworld].residents.push(residentResult.data.name);
          return '';
        });
      }));
    }));
  })
  .then(planetsWithPeople => {
    //planets now formatted like {planetUrl:{name:"", residents:[]}}
    const formattedPlanets = [];
    Object.keys(planets).map(key => {
      let tempPlanet = {};
      tempPlanet[planets[key].name] = planets[key].residents;
      formattedPlanets.push(tempPlanet);
    });
    return res.json(formattedPlanets);
  })
  .catch(err => res.json({error: err.message}));
})

// The aws-serverless-express library creates a server and listens on a Unix
// Domain Socket for you, so you can remove the usual call to app.listen.
// app.listen(3000)

// Export your express server so you can import it in the lambda function.
module.exports = app
