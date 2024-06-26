import { useEffect, useRef, useState, ChangeEvent } from "react";
import { Map, MapBrowserEvent, View } from "ol";
import GeoJSON from "ol/format/GeoJSON";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style } from "ol/style";
import { FeatureLike } from "ol/Feature.js";
import {
  FullScreen,
  defaults as defaultControls,
  ScaleLine,
  ZoomSlider,
  OverviewMap,
} from "ol/control.js";
import { fromLonLat } from "ol/proj.js";
import { AnimationOptions } from "ol/View.js";
import { Units } from "ol/control/ScaleLine.js";

import Legend from "./Legend.js";
import Header from "./Header.js";

import "ol/ol.css";

import {
  MdKeyboardDoubleArrowRight,
  MdKeyboardDoubleArrowLeft,
} from "react-icons/md";

interface FeatureProperties {
  name: string;
  density: number;
}

interface FeatureGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

interface GeoJsonFeature {
  type: "Feature";
  id: string;
  properties: FeatureProperties;
  geometry: FeatureGeometry;
}

interface GeoJsonData {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

const newYork = fromLonLat([-73.935242, 40.73061]);

const elastic = (t: number) => {
  return (
    Math.pow(2, -10 * t) * Math.sin(((t - 0.075) * (2 * Math.PI)) / 0.3) + 1
  );
};

const MapComponent: React.FC = () => {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonData | null>(null);
  const [popoverVisible, setPopoverVisible] = useState<boolean>(false);
  const [popoverContent, setPopoverContent] =
    useState<FeatureProperties | null>(null);

  const [isSideBarOpen, setIsSideBarOpen] = useState<boolean>(true);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const [scaleLineUnit, setScaleLineUnit] = useState<Units | undefined>(
    "metric"
  );
  const [isZoomScaledOn, setIsZoomScaledOn] = useState<boolean>(true);
  const [isoverViewMapOn, setIsOverViewMapOn] = useState<boolean>(true);

  const popoverRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const mapRef = useRef<Map | undefined>(undefined);

  useEffect(() => {
    const fetchApi = async () => {
      const res = await fetch(
        "https://openlayers.org/data/vector/us-states.json"
      );
      const data: GeoJsonData = await res.json();
      setGeoJsonData(data);
    };

    fetchApi();
  }, []);

  const getColorForDensity = (density: number): string => {
    // Define a color scale based on density
    if (density > 200) return "#13202D";
    if (density > 100) return "#14293D";
    if (density > 50) return "#16304D";
    if (density > 20) return "#1D365C";
    if (density > 10) return "#243A6B";
    if (density > 5) return "#2A417B";
    return "#2B448C";
  };

  useEffect(() => {
    if (geoJsonData) {
      const vectorSource = new VectorSource({
        features: new GeoJSON().readFeatures(geoJsonData, {
          featureProjection: "EPSG:3857",
        }),
      });

      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: (feature: FeatureLike) => {
          const density = feature.get("density");
          const color = getColorForDensity(density);
          return new Style({
            fill: new Fill({
              color: color,
            }),
            stroke: new Stroke({
              color: "#000",
              width: 0.5,
            }),
          });
        },
      });

      const view = new View({
        center: [-11542437.750890903, 4862581.061116328],
        zoom: 4,
      });

      viewRef.current = view;

      const overviewMapControl = new OverviewMap({
        className: "ol-overviewmap ol-custom-overviewmap",
        layers: [
          new TileLayer({
            source: new OSM({
              url:
                "https://{a-c}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png" +
                "?apikey=07fc353cad414368a54104c13b3a84ab",
            }),
          }),
        ],
        collapseLabel: "\u00BB",
        label: "\u00AB",
        collapsed: false,
      });

      const map = new Map({
        target: "map",
        layers: [
          new TileLayer({
            source: new OSM(),
          }),
          vectorLayer,
        ],
        view: view,
        controls: defaultControls().extend([
          new FullScreen(),
          new ScaleLine({ units: scaleLineUnit }),
        ]),
      });

      mapRef.current = map;

      if (isZoomScaledOn) {
        map.addControl(new ZoomSlider());
      }

      if (isoverViewMapOn) {
        map.addControl(overviewMapControl);
      }

      const handleHover = (event: MapBrowserEvent<PointerEvent>) => {
        const feature = map.forEachFeatureAtPixel(event.pixel, (feature) => {
          return feature;
        });

        if (feature) {
          const properties = feature.getProperties();
          const coordinates = event.coordinate;

          if (properties) {
            const content: FeatureProperties = {
              name: properties.name,
              density: properties.density,
            };

            setPopoverContent(content);
          }

          setPopoverVisible(true);

          if (popoverRef.current) {
            const pixel = map.getPixelFromCoordinate(coordinates);
            const left = pixel[0] + 5 + "px";
            const top = pixel[1] - 60 + "px";

            popoverRef.current.style.left = left;
            popoverRef.current.style.top = top;
          }
        } else {
          setPopoverVisible(false);
        }
      };

      map.on("pointermove", handleHover);

      return () => {
        map.un("pointermove", handleHover);
        map.setTarget(undefined);
      };
    }
  }, [geoJsonData, scaleLineUnit, isZoomScaledOn, isoverViewMapOn]);

  const closeSideBarHandler = () => {
    setIsAnimating(true);
    setIsSideBarOpen(false);
    setTimeout(() => {
      setIsAnimating(false);
    }, 300); // Match the CSS animation duration
  };

  const openSideBarHandler = () => {
    setIsAnimating(true);
    setIsSideBarOpen(true);
    setTimeout(() => {
      setIsAnimating(false);
    }, 750); // Match the CSS animation duration
  };

  const unitsHandler = (e: ChangeEvent<HTMLSelectElement>) => {
    setScaleLineUnit(e.target.value as Units);
  };

  const zoomSliderHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setIsZoomScaledOn(e.target.checked);
  };

  const animateView = (options: AnimationOptions) => {
    viewRef?.current?.animate(options);
  };

  const elasticToNewYork = () => {
    animateView({ center: newYork, duration: 2000, easing: elastic, zoom: 6 });
  };

  const overViewMapHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setIsOverViewMapOn(e.target.checked);
  };

  return (
    <div className="grid grid-cols-12 grid-rows-12 pb-2 gap-2 w-screen h-screen">
      <div className="col-span-12 row-span-1">
        <Header />
      </div>

      <div className="col-span-2 row-span-11 relative">
        <div
          className={`${
            isSideBarOpen ? "open-sidebar" : "close-sidebar"
          } w-full h-full bg-[#3590F0] rounded-r-lg absolute`}
        >
          <div>
            <button
              className="text-3xl text-white ml-52 mt-1"
              onClick={closeSideBarHandler}
            >
              <MdKeyboardDoubleArrowLeft />
            </button>

            <div>
              <select
                name="units"
                id="units"
                onChange={unitsHandler}
                defaultValue={"metric"}
              >
                <option value="degrees">degrees</option>
                <option value="imperial">imperial inch</option>
                <option value="us">us inch</option>
                <option value="nautical">nautical mile</option>
                <option value="metric">metric</option>
              </select>
            </div>

            <div>
              <label htmlFor="zoomSlider">ZoomSlider</label>
              <input
                type="checkbox"
                name="zoomSlider"
                id="zoomSlider"
                onChange={zoomSliderHandler}
                checked={isZoomScaledOn}
              />
            </div>

            <div>
              <button
                onClick={() => {
                  elasticToNewYork();
                }}
              >
                Go to new york
              </button>
            </div>

            <div className="">
              <label htmlFor="overViewMap">Over View Map</label>
              <input
                type="checkbox"
                name="overViewMap"
                id="overViewMap"
                onChange={overViewMapHandler}
                checked={isoverViewMapOn}
              />
            </div>
          </div>
        </div>

        {!isSideBarOpen && !isAnimating && (
          <div className="h-[90vh] bg-white absolute left-0 top-0">
            <button
              className="text-3xl bg-[#3590F0] px-1 rounded-r-lg text-white"
              onClick={openSideBarHandler}
            >
              <MdKeyboardDoubleArrowRight />
            </button>
          </div>
        )}
      </div>

      <div className="relative col-span-10 row-span-11">
        {/* Map will be rendered here */}
        <div id="map" className="w-full h-full"></div>

        {/* Hover Effect */}
        {popoverVisible && (
          <div
            ref={popoverRef}
            className="absolute bg-white border border-solid border-black p-3 z-50 pointer-events-none"
          >
            <div className="text-sm leading-3">
              <h3>{popoverContent && popoverContent.name}</h3>
              <h3>Density: {popoverContent && popoverContent.density}</h3>
            </div>
          </div>
        )}

        {/* Legends */}
        {/* <div className="absolute bottom-14 left-2 bg-white p-2 border border-solid border-black">
          <Legend />
        </div> */}
      </div>
    </div>
  );
};

export default MapComponent;
