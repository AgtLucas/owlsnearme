import React, { Component } from 'react';
import './x-near-you.css';
import { get } from 'axios';
import { Map, TileLayer } from 'react-leaflet';
import moment from 'moment-es6';

const cleanPlaces = (places) => {
  return places.map(({bounding_box_geojson, name, display_name}) => {
    return {bounding_box_geojson, name, display_name};
  });
}

const haversine_distance_km = (lat1, lon1, lat2, lon2) => {
    const world_radius_km = 6371;
    const p = Math.PI / 180;
    const a = (
        0.5 - Math.cos((lat2 - lat1) * p) / 2 +
        Math.cos(lat1 * p) * Math.cos(lat2 * p) *
        (1 - Math.cos((lon2 - lon1) * p)) / 2
    );
    return world_radius_km * 2 * Math.asin(Math.sqrt(a));
}

class App extends Component {
  state = {
    standardPlaces: [],
    communityPlaces: [],
    placeName: null,
    /* Tokyo:
    lat: 35.66,
    lng: 139.781
    */
    lng: null,//-122.4494224,
    lat: null,//37.8022071
    nelat: null,
    nelng: null,
    swlat: null,
    swlng: null,
    q: null
  }
  fetchPlaceData(lat, lng) {
    get(
      'https://api.inaturalist.org/v1/places/nearby', {
        params: {
          nelat: lat,
          nelng: lng,
          swlat: lat,
          swlng: lng
        }
      }
    ).then(response => {
      this.setState({
        standardPlaces: cleanPlaces(response.data.results.standard),
        communityPlaces: cleanPlaces(response.data.results.community),
      });
    });
  }
  fetchSpeciesData() {
    // Prefers nelat/nelng/swlat/swlng to lat/lng
    if (!this.state.nelat && !this.state.lat) {
      return;
    }
    const location = this.state.nelat ? {
      nelat: this.state.nelat,
      nelng: this.state.nelng,
      swlat: this.state.swlat,
      swlng: this.state.swlng
    } : {
      lat: this.state.lat,
      lng: this.state.lng,
      radius: 50
    };
    get(
      'https://api.inaturalist.org/v1/observations/species_counts', {
        params: {
          taxon_id: 19350,
          ...location
        }
      }
    ).then(response => {
      this.setState({species: response.data.results.map(r => {
        return {
          count: r.count,
          common_name: r.taxon.preferred_common_name,
          name: r.taxon.name,
          image: r.taxon.default_photo.square_url.replace('_s.', '_q.'),
          id: r.taxon.id
        }
      })});
    });
    get(
      'https://api.inaturalist.org/v1/observations', {
        params: {
          taxon_id: 19350,
          order_by: 'observed_on',
          ...location,
          photos: true
        }
      }
    ).then(response => {
      this.setState({observations: response.data.results.map(o => {
        let distance_km = null;
        if (this.state.lat && o.location) {
          distance_km = haversine_distance_km(
            this.state.lat, this.state.lng,
            parseFloat(o.location.split(',')[0]),
            parseFloat(o.location.split(',')[1]),
          );
        }
        return {
          time_observed_at: moment(o.time_observed_at).format('MMMM Do YYYY, h:mm:ss a'),
          image_square: o.photos[0].url,
          image_medium: o.photos[0].url.replace('square.', 'medium.'),
          common_name: o.taxon.preferred_common_name,
          name: o.taxon.name,
          uri: o.uri,
          user_name: o.user.name,
          user_login: o.user.login,
          place_guess: o.place_guess,
          distance_km
        }
      })});
    });
  }
  componentDidMount() {
    this.fetchSpeciesData();
  }
  onSubmit(ev) {
    ev.preventDefault();
    get(
      'https://api.inaturalist.org/v1/places/autocomplete', {
        params: {
          q: this.state.q
        }
      }
    ).then(response => {
      const results = response.data.results;
      if (results.length) {
        var swlat, swlng, nelat, nelng;
        results[0].bounding_box_geojson.coordinates[0].forEach(p => {
          let lng = p[0];
          let lat = p[1];
          swlat = swlat ? Math.min(swlat, lat) : lat;
          swlng = swlng ? Math.min(swlng, lng) : lng;
          nelat = nelat ? Math.max(nelat, lat) : lat;
          nelng = nelng ? Math.max(nelng, lng) : lng;
        });
        this.setState({
          swlat,
          swlng,
          nelat,
          nelng,
          placeName: results[0].display_name,
          place: results[0]
        }, () => {
          this.fetchSpeciesData();
        });
      }
    });
  }
  onTextChange(ev) {
    this.setState({
      q: ev.target.value
    });
  }
  onDeviceLocationClick() {
    window.navigator.geolocation.getCurrentPosition((position) => {
      this.setState({
        swlat: null,
        swlng: null,
        nelat: null,
        nelng: null,
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }, () => {
        this.fetchSpeciesData();
      });
      this.fetchPlaceData(position.coords.latitude, position.coords.longitude);
    });
  }
  render() {
    const position = this.state.lat && [this.state.lat, this.state.lng];
    let map = null;
    const layers = [
      <TileLayer
        attribution="&amp;copy <a href=&quot;https://osm.org/copyright&quot;>OpenStreetMap</a> contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />,
      <TileLayer
        attribution="<a href=&quot;https://www.inaturalist.org/&quot;>iNaturalist</a>"
        url="https://api.inaturalist.org/v1/colored_heatmap/{z}/{x}/{y}.png?taxon_id=19350"
      />
    ];
    if (this.state.swlat) {
      const bounds = [
        [this.state.swlat, this.state.swlng],
        [this.state.nelat, this.state.nelng]
      ];
      map = <Map dragging={false} zoomControl={false} bounds={bounds}>{layers[0]}{layers[1]}</Map>;
    } else if (this.state.lat) {
      map = <Map dragging={false} zoomControl={false} center={position} zoom={12}>{layers[0]}{layers[1]}</Map>;
    }
    const deviceLocationButton = window.navigator.geolocation && (
      <div>
        <input
          type="button"
          className="submit"
          value="Use device location"
          onClick={this.onDeviceLocationClick.bind(this)}
        />
      </div>
    );
    return (<div>
      <section className="primary">
        <div className="inner">
          <h1>Find owls near me!</h1>

          <form action="/" method="GET" onSubmit={this.onSubmit.bind(this)}>
            <div>
              <input
                type="text"
                size={30}
                title="Location"
                className="text"
                name="q"
                onChange={this.onTextChange.bind(this)}
                placeholder="Search for a place, e.g. San Francisco"
                value={this.state.q || ''}
              />
              <input type="submit" className="submit" value="Go" />
              <p className="help">e.g. <a href="/?q=Brighton">Brighton</a> or <a href="/?q=San+Francisco">San Francisco</a></p>
              {deviceLocationButton}
            </div>
          </form>
          {map}
          {this.state.observations && <div>
            {this.state.observations.map((o) => (
              <div className="species" key={o.uri}>
                <a href={o.uri}><img src={o.image_medium} alt={o.common_name} /></a>
                <h3>{o.common_name}</h3>
                <p>
                  <em>{o.name}</em> spotted by {o.user_name || o.user_login }
                  {o.distance_km && <span>&nbsp;{`${(o.distance_km * (1000/1600)).toFixed(1)} miles away`}&nbsp;</span>}
                  in {o.place_guess} on {o.time_observed_at}
                </p>
              </div>
            ))}
          </div>}
          {this.state.species && <div>
            <h2>Owls you might see here...</h2>
            {this.state.species.map((s) => (
              <div className="species" key={s.id}>
                <a href={`https://www.inaturalist.org/species/${s.id}`}><img src={s.image} alt={s.common_name} /></a>
                <h3>{s.common_name}</h3>
                <p><em>{s.name}</em> spotted {s.count} times</p>
              </div>
            ))}
          </div>}
        </div>
      </section>
      <section className="footer">
        <div className="inner">
          <p>by <a href="https://www.inaturalist.org/people/natbat">Natalie Downe</a>
           and <a href="https://www.inaturalist.org/people/simonw">Simon Willison</a>
           using data from <a href="https://www.inaturalist.org/">iNaturalist</a></p>
        </div>
      </section>
      {window.localStorage.getItem('debug') && <section>
        <div className="inner">
          <h2>Debug information</h2>
          <pre>
            {JSON.stringify(this.state, null, 2)}
          </pre>
        </div>
      </section>}
    </div>);
  }
}
export default App;
