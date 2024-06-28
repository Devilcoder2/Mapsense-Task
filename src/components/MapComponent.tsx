import { useEffect, useRef, useState, ChangeEvent } from "react";
import { Map, MapBrowserEvent, View } from "ol";
import GeoJSON from "ol/format/GeoJSON";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Text } from "ol/style";
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
import { Draw, Modify, Snap } from "ol/interaction.js";

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

type GeometryType = "Point" | "LineString" | "Polygon" | "Circle" | "None";

const newYork = fromLonLat([-73.935242, 40.73061]);

const elastic = (t: number) => {
  return (
    Math.pow(2, -10 * t) * Math.sin(((t - 0.075) * (2 * Math.PI)) / 0.3) + 1
  );
};

const MapComponent: React.FC = () => {
  const [geoJsonData, setGeoJsonData] = useState<GeoJsonData | null>(null);
  const [filteredGeoJsonData, setFilteredGeoJsonData] =
    useState<GeoJsonData | null>(null);
  const [popoverVisible, setPopoverVisible] = useState<boolean>(false);
  const [popoverContent, setPopoverContent] =
    useState<FeatureProperties | null>(null);

  const [isSideBarOpen, setIsSideBarOpen] = useState<boolean>(true);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const [scaleLineUnit, setScaleLineUnit] = useState<Units | undefined>(
    "metric"
  );

  const [currentGeometry, setCurrentGeometry] = useState<GeometryType>("None");

  const [isZoomScaledOn, setIsZoomScaledOn] = useState<boolean>(false);
  const [isoverViewMapOn, setIsOverViewMapOn] = useState<boolean>(false);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<View | null>(null);
  const mapRef = useRef<Map | undefined>(undefined);

  useEffect(() => {
    const fetchApi = async () => {
      const res = await fetch(
        "https://openlayers.org/data/vector/us-states.json"
      );
      const data: GeoJsonData = await res.json();
      setGeoJsonData(data);
      setFilteredGeoJsonData(data);
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
        features: new GeoJSON().readFeatures(filteredGeoJsonData, {
          featureProjection: "EPSG:3857",
        }),
      });

      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: (feature: FeatureLike) => {
          const density = feature.get("density");
          const color = getColorForDensity(density);

          // Style for the polygon
          const style = new Style({
            fill: new Fill({
              color: color,
            }),
            stroke: new Stroke({
              color: "#000",
              width: 0.5,
            }),
          });

          // Text style for the state name
          const text = feature.get("name");
          if (text) {
            style.setText(
              new Text({
                text: text,
                font: "12px Calibri,sans-serif",
                fill: new Fill({ color: "#fff" }),
                offsetX: 0,
                offsetY: -10,
                textAlign: "center",
                textBaseline: "middle",
              })
            );
          }

          return style;
        },
      });

      const drawSource = new VectorSource();
      const drawVector = new VectorLayer({
        source: drawSource,
        style: {
          "fill-color": "rgba(255, 255, 255, 0.2)",
          "stroke-color": "#2eca6f",
          "stroke-width": 2,
          "circle-radius": 7,
          "circle-fill-color": "#2eca6f",
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
          drawVector,
        ],
        view: view,
        controls: defaultControls().extend([
          new FullScreen({ className: "custom-fullscreen" }),
          new ScaleLine({ units: scaleLineUnit }),
        ]),
      });

      mapRef.current = map;

      map.on("loadstart", function () {
        map.getTargetElement().classList.add("spinner");
      });
      map.on("loadend", function () {
        map.getTargetElement().classList.remove("spinner");
      });

      const modify = new Modify({ source: drawSource });
      map.addInteraction(modify);

      let draw, snap;

      const addInteractions = () => {
        if (currentGeometry !== "None") {
          draw = new Draw({
            source: drawSource,
            type: currentGeometry,
          });
          snap = new Snap({ source: drawSource });

          map.addInteraction(draw);
          map.addInteraction(snap);
        }
      };

      addInteractions();

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
            const left = pixel[0] - 48 + "px";
            const top = pixel[1] - 75 + "px";

            popoverRef.current.style.left = left;
            popoverRef.current.style.top = top;
          }
        } else {
          setPopoverVisible(false);
        }
      };

      if (currentGeometry === "None") {
        map.on("pointermove", handleHover);
      }

      return () => {
        map.un("pointermove", handleHover);
        map.setTarget(undefined);
      };
    }
  }, [
    geoJsonData,
    scaleLineUnit,
    isZoomScaledOn,
    isoverViewMapOn,
    filteredGeoJsonData,
    currentGeometry,
  ]);

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

  const showLegendHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setShowLegend(e.target.checked);
  };

  const filterHandler = (n: number) => {
    if (geoJsonData !== null) {
      const newFeatures = geoJsonData.features.filter((t) => {
        return t.properties.density > n;
      });

      setFilteredGeoJsonData(() => {
        const newGeoJsonData: GeoJsonData = {
          type: "FeatureCollection",
          features: newFeatures,
        };

        return newGeoJsonData;
      });
    }
  };

  const searchHandler = () => {
    if (inputRef.current !== null) {
      const val = inputRef.current.value;
      filterHandler(Number(val));
    }
  };

  const geoChangeHandler = (e: ChangeEvent<HTMLInputElement>) => {
    const newGeo: GeometryType = e.target.value as GeometryType;
    setCurrentGeometry(newGeo);
  };

  return (
    <div className="grid grid-cols-12 grid-rows-12 pb-2 gap-2 w-screen h-screen">
      {/* HEADER */}
      <div className="col-span-12 row-span-1  bg-[#3590F0] py-2 ">
        <Header />
      </div>

      {/* SIDEBAR */}
      <div
        className={`relative    ${
          isSideBarOpen
            ? "lg:row-span-11 lg:col-span-2 sm:row-span-3 sm:col-span-12 row-span-5 col-span-12"
            : "lg:col-span-1 lg:row-span-12 sm:row-span-1 sm:col-span-12 row-span-1 col-span-12"
        }`}
      >
        <div
          className={`${
            isSideBarOpen ? "open-sidebar" : "close-sidebar "
          } w-full h-full bg-[#3590F0] lg:rounded-r-lg absolute`}
        >
          <div className={`${isSideBarOpen ? "" : " hidden"}`}>
            <button
              className={`text-3xl text-white lg:ml-52 lg:mt-1 md:ml-60 md:mt-1 ml-48 mt-1`}
              onClick={closeSideBarHandler}
            >
              <MdKeyboardDoubleArrowLeft />
            </button>

            <div className="absolute top-2 left-5">
              <h1 className="text-white text-sm md:text-lg font-semibold">
                CONTROL PANEL
              </h1>
            </div>

            <div className="flex justify-between  -mt-3 text-sm lg:text-base lg:block lg:mt-0">
              <div className="mt-4 flex items-center checkbox-wrapper-12 ml-5">
                <div className="cbx">
                  <input
                    type="checkbox"
                    name="zoomSlider"
                    id="zoomSlider"
                    onChange={zoomSliderHandler}
                    checked={isZoomScaledOn}
                  />
                  <label htmlFor="zoomSlider"></label>
                  <svg width="15" height="14" viewBox="0 0 15 14" fill="none">
                    <path d="M2 8.36364L6.23077 12L13 2"></path>
                  </svg>
                </div>
                <label htmlFor="zoomSlider" className="text-white ml-2">
                  Zoom Slider
                </label>
                <svg xmlns="http://www.w3.org/2000/svg" version="1.1">
                  <defs>
                    <filter id="goo-12">
                      <feGaussianBlur
                        in="SourceGraphic"
                        stdDeviation="4"
                        result="blur"
                      ></feGaussianBlur>
                      <feColorMatrix
                        in="blur"
                        mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -7"
                        result="goo-12"
                      ></feColorMatrix>
                      <feBlend in="SourceGraphic" in2="goo-12"></feBlend>
                    </filter>
                  </defs>
                </svg>
              </div>

              <div className="mt-4 flex items-center checkbox-wrapper-12 ml-5">
                <div className="cbx">
                  <input
                    type="checkbox"
                    name="overViewMap"
                    id="overViewMap"
                    onChange={overViewMapHandler}
                    checked={isoverViewMapOn}
                  />
                  <label htmlFor="overViewMap"></label>
                  <svg width="15" height="14" viewBox="0 0 15 14" fill="none">
                    <path d="M2 8.36364L6.23077 12L13 2"></path>
                  </svg>
                </div>
                <label htmlFor="overViewMap" className="text-white ml-2">
                  Over View Map
                </label>
                <svg xmlns="http://www.w3.org/2000/svg" version="1.1">
                  <defs>
                    <filter id="goo-12">
                      <feGaussianBlur
                        in="SourceGraphic"
                        stdDeviation="4"
                        result="blur"
                      ></feGaussianBlur>
                      <feColorMatrix
                        in="blur"
                        mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -7"
                        result="goo-12"
                      ></feColorMatrix>
                      <feBlend in="SourceGraphic" in2="goo-12"></feBlend>
                    </filter>
                  </defs>
                </svg>
              </div>

              <div className="mt-4 flex items-center checkbox-wrapper-12 ml-5 mr-3">
                <div className="cbx">
                  <input
                    type="checkbox"
                    name="showLegend"
                    id="showLegend"
                    onChange={showLegendHandler}
                    checked={showLegend}
                  />
                  <label htmlFor="showLegend"></label>
                  <svg width="15" height="14" viewBox="0 0 15 14" fill="none">
                    <path d="M2 8.36364L6.23077 12L13 2"></path>
                  </svg>
                </div>

                <label htmlFor="showLegend" className="ml-2 text-white">
                  Show Legend
                </label>
                <svg xmlns="http://www.w3.org/2000/svg" version="1.1">
                  <defs>
                    <filter id="goo-12">
                      <feGaussianBlur
                        in="SourceGraphic"
                        stdDeviation="4"
                        result="blur"
                      ></feGaussianBlur>
                      <feColorMatrix
                        in="blur"
                        mode="matrix"
                        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -7"
                        result="goo-12"
                      ></feColorMatrix>
                      <feBlend in="SourceGraphic" in2="goo-12"></feBlend>
                    </filter>
                  </defs>
                </svg>
              </div>
            </div>

            <div className="md:flex lg:block mt-5 lg:mt-0">
              <div className="md:flex lg:block">
                <div className="mt-4 ml-5 lg:mt-6 lg:ml-5">
                  <button
                    onClick={() => {
                      elasticToNewYork();
                    }}
                    className="bg-white px-2 py-1  lg:px-4 lg:py-2 rounded-lg text-[#2eca6f] hover:bg-[#2eca6f] outline-none active:text-white hover:text-white transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 active:bg-[#2edb6f]"
                  >
                    Go to New York
                  </button>
                </div>

                <div className="md:mt-4  lg:mt-6 flex  lg:flex-col items-start space-x-1 lg:space-y-1 lg:ml-5 md:ml-8 ml-5 mt-2">
                  <input
                    ref={inputRef}
                    type="number"
                    placeholder="Enter Population Density "
                    className="px-2 py-1 lg:px-2 lg:py-2 mb-1 rounded-lg outline-none border-none placeholder:text-gray-500"
                  />
                  <button
                    onClick={searchHandler}
                    className="bg-white  px-2 py-1   lg:px-4 lg:py-2 rounded-lg text-[#2eca6f] hover:bg-[#2eca6f] outline-none active:text-white hover:text-white transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 active:bg-[#2edb6f]"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="lg:mt-6 lg:ml-5 flex items-center lg:block mt-3 md:ml-8 ml-5">
                <h1 className="text-white  text-[1.1rem]">Scale Line Units</h1>
                <select
                  name="units"
                  id="units"
                  onChange={unitsHandler}
                  defaultValue={"metric"}
                  className="rounded-lg text-sm py-2  lg:text-base px-2 lg:py-2 md:py-1 lg:-ml-1 lg:mt-1 ml-4  md:-mt-1 white text-[#2eca6f] focus:outline-none focus:ring-2 focus:ring-[#3590F0]"
                >
                  <option value="degrees">Degrees</option>
                  <option value="imperial">Imperial inch</option>
                  <option value="us">Us inch</option>
                  <option value="nautical">Nautical mile</option>
                  <option value="metric">Metric</option>
                </select>
              </div>
            </div>

            <div className="lg:mt-6 mt-3 " id="type">
              <label
                htmlFor="type"
                className="block text-[1.1rem]  ml-5 text-white mb-2"
              >
                Geometry type
              </label>

              <div className="lg:-mt-1 flex lg:block -mt-2">
                <div className="ml-1">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="geometryType"
                      value="None"
                      className="form-radio visually-hidden"
                      onChange={geoChangeHandler}
                      defaultChecked
                    />
                    <span className="radio-style ml-2">None</span>
                  </label>
                </div>

                <div className="ml-1">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="geometryType"
                      value="Point"
                      className="form-radio visually-hidden"
                      onChange={geoChangeHandler}
                    />
                    <span className="radio-style ml-2">Point</span>
                  </label>
                </div>

                <div className="ml-1">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="geometryType"
                      value="Polygon"
                      className="form-radio visually-hidden"
                      onChange={geoChangeHandler}
                    />
                    <span className="radio-style ml-2">Polygon</span>
                  </label>
                </div>

                <div className="ml-1">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="geometryType"
                      value="Circle"
                      className="form-radio visually-hidden"
                      onChange={geoChangeHandler}
                    />
                    <span className="radio-style ml-2">Circle</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!isSideBarOpen && !isAnimating && (
          <div className="h-[0]  bg-white absolute left-0 top-0">
            <button
              className="text-3xl bg-[#3590F0] px-1 rounded-r-lg text-white"
              onClick={openSideBarHandler}
            >
              <MdKeyboardDoubleArrowRight />
            </button>
          </div>
        )}
      </div>

      {/* MAP */}
      <div
        className={`relative    ${
          isSideBarOpen
            ? "lg:row-span-11 lg:col-span-10 sm:row-span-8 sm:col-span-12 row-span-6 col-span-12"
            : "lg:col-span-11 lg:row-span-12 sm:row-span-10 sm:col-span-12 row-span-10 col-span-12"
        }`}
      >
        {/* Map will be rendered here */}
        <div id="map" className="w-full h-full"></div>

        {/* Hover Effect */}
        {popoverVisible && (
          <div ref={popoverRef} className="absolute bg-white ol-popup">
            <div className="text-sm leading-3">
              <h3 className="mb-2 ">{popoverContent && popoverContent.name}</h3>
              <h3>Density: {popoverContent && popoverContent.density}</h3>
            </div>
          </div>
        )}

        {/* Legends */}
        {showLegend && (
          <div className="absolute bottom-9 ml-10 lg:bottom-14 lg:left-2 bg-white lg:p-2 w-[80%] lg:w-[10%] border border-solid border-black rounded-lg">
            <Legend />
          </div>
        )}
      </div>
    </div>
  );
};

export default MapComponent;
