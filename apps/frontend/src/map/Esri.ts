import XYZ from 'ol/source/XYZ.js';

export const ATTRIBUTION =
  'Powered by <a href="https://esri.com" target="_blank">Esri</a> | Sources: Esri, DigitalGlobe, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community.';

export default class Esri extends XYZ {
  constructor() {
    super({
      attributions: [ATTRIBUTION],
      attributionsCollapsible: false,
      crossOrigin: 'anonymous',
      referrerPolicy: 'origin-when-cross-origin',
      maxZoom: 18,
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    });
  }
}
