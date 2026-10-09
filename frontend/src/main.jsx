import { ContactShadows, Environment, Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Activity, Crosshair, Gamepad2, RotateCcw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Box3, Euler, Quaternion, Vector3 } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import "./styles.css";

const WS_SCHEME = window.location.protocol === "https:" ? "wss" : "ws";
const API_HOST = import.meta.env.VITE_API_HOST || window.location.host;
const NEUTRAL_POSE = {
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  position: { x: 0, y: 0, z: 0 },
};
const DEFAULT_MODEL_ALIGNMENT = { x: 0, y: 0, z: 0 };
const DEVICE_SCREEN_CORRECTION = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

function websocketUrl(room) {
  return `${WS_SCHEME}://${API_HOST}/ws/joystick/${room}/`;
}

function createRoom() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function readMotion(message) {
  const motion = {
    alpha: Number(message.alpha || 0),
    beta: Number(message.beta || 0),
    gamma: Number(message.gamma || 0),
  };

  const quaternion = quaternionFromDeviceOrientation(motion);
  motion.quaternion = {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };

  return motion;
}

function quaternionFromDeviceOrientation(motion) {
  return new Quaternion()
    .setFromEuler(
      new Euler(
        degreesToRadians(motion.beta),
        degreesToRadians(motion.alpha),
        -degreesToRadians(motion.gamma),
        "YXZ"
      )
    )
    .multiply(DEVICE_SCREEN_CORRECTION)
    .normalize();
}

function poseFromCalibratedMotion(motion, calibration) {
  const current = new Quaternion(motion.quaternion.x, motion.quaternion.y, motion.quaternion.z, motion.quaternion.w);
  const origin = new Quaternion(
    calibration.quaternion.x,
    calibration.quaternion.y,
    calibration.quaternion.z,
    calibration.quaternion.w
  );
  const relative = current.multiply(origin.invert()).normalize();

  return {
    quaternion: {
      x: relative.x,
      y: relative.y,
      z: relative.z,
      w: relative.w,
    },
    position: NEUTRAL_POSE.position,
  };
}

async function readPermission(name) {
  if (!navigator.permissions?.query) {
    return "sin api";
  }

  try {
    const result = await navigator.permissions.query({ name });
    return result.state;
  } catch (_error) {
    return "no soportado";
  }
}

function useJoystickSocket(room, onMessage) {
  const [status, setStatus] = useState("connecting");
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    setStatus("connecting");
    const socket = new WebSocket(websocketUrl(room));
    socketRef.current = socket;

    socket.onopen = () => setStatus("connected");
    socket.onclose = () => setStatus("closed");
    socket.onerror = () => setStatus("error");
    socket.onmessage = (event) => {
      try {
        onMessageRef.current(JSON.parse(event.data));
      } catch (_error) {
        setStatus("error");
      }
    };

    return () => socket.close();
  }, [room]);

  const send = useCallback((payload) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  return { status, send };
}

function ProceduralProbe() {
  return (
    <group rotation={[0, 0, 0]}>
      <mesh castShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[0.92, 1.25, 0.62, 14, 18, 10]} />
        <meshStandardMaterial color="#d9e2e7" metalness={0.18} roughness={0.34} wireframe />
      </mesh>
      <mesh castShadow position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.54, 0.76, 0.72, 36, 8]} />
        <meshStandardMaterial color="#f2f5f6" metalness={0.08} roughness={0.4} wireframe />
      </mesh>
      <mesh castShadow position={[0, -0.58, 0]}>
        <cylinderGeometry args={[0.7, 0.82, 0.22, 40, 5]} />
        <meshStandardMaterial color="#9bd4df" metalness={0.05} roughness={0.28} wireframe />
      </mesh>
      <mesh position={[0, -0.71, 0]}>
        <boxGeometry args={[1.15, 0.035, 0.78, 18, 2, 12]} />
        <meshStandardMaterial color="#37a6ba" metalness={0.08} roughness={0.22} />
      </mesh>
    </group>
  );
}

function StlProbe({ modelPath, centered = true }) {
  
  const loadedGeometry = useLoader(STLLoader, modelPath);

  const geometry = useMemo(() => {
    const clonedGeometry = loadedGeometry.clone();

    if (centered) {
      clonedGeometry.center();
    }

    return clonedGeometry;
  }, [loadedGeometry, centered]);

  return (
    <mesh geometry={geometry} castShadow /*rotation={[0, 0, 0]}*/ scale={0.022}>
      <meshStandardMaterial color="#B2FFFF" metalness={0.08} roughness={0.42} />
    </mesh>
  );
}

//Funcion para centrar todo el conjunto de estructuras en modo multiple
function MultipleStructures({ paths }) {
  const group = useRef(null);
  useEffect(() => {
    if (!group.current) return;
    // Restablecer la posición antes de calcular el nuevo centro
    group.current.position.set(0, 0, 0);
    group.current.updateWorldMatrix(true, true);
    // Calcular el bounding box de todas las estructuras
    const box = new Box3().setFromObject(group.current);
    if (box.isEmpty()) return;
    // Obtener el centro del conjunto
    const center = new Vector3();
    box.getCenter(center);
    // Centrar todas las estructuras como un único conjunto
    group.current.position.set(
      -center.x,
      -center.y,
      -center.z
    );
  }, [paths]);
  return (
    <group ref={group}>
      {paths.map((path) => (
        <StlProbe
          key={path}
          modelPath={path}
          centered={false}
        />
      ))}
    </group>
  );
}

function Probe({pose,hasStl,modelAlignment,modelPath,visualizationMode,selectedStructures,}) {
  const group = useRef(null);
  const targetQuaternion = useRef(new Quaternion());

  useFrame((_state, delta) => {
    if (!group.current) return;
    targetQuaternion.current.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w);
    group.current.quaternion.slerp(targetQuaternion.current, Math.min(1, delta * 9));
    group.current.position.x = 0;
    group.current.position.y = 0;
    group.current.position.z = 0;
  });

  return (
    <group ref={group}>
      <group rotation={[modelAlignment.x, modelAlignment.y, modelAlignment.z]}>
        <Suspense fallback={<ProceduralProbe />}>
        {visualizationMode === "individual" ? (
          hasStl && modelPath ? (
            <StlProbe modelPath={modelPath} centered={true} />
          ) : (
            <ProceduralProbe />
          )
        ) : selectedStructures.length > 0 ? (
          <MultipleStructures paths={selectedStructures} />
        ) : null}
      </Suspense>
      </group>
    </group>
  );
}

function ReferenceAnchors() {
  return (
    <group>
      <mesh position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.86, 0.014, 12, 96]} />
        <meshStandardMaterial color="#193438" roughness={0.45} />
      </mesh>
      <mesh position={[0, -0.995, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.13, 0.18, 40]} />
        <meshStandardMaterial color="#193438" roughness={0.45} />
      </mesh>
      <mesh position={[1.28, -0.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.13, 36]} />
        <meshStandardMaterial color="#2563eb" roughness={0.35} />
      </mesh>
    </group>
  );
}

function Scene({pose,hasStl,modelAlignment,modelPath,visualizationMode,selectedStructures,}) {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 44 }} shadows>
      <color attach="background" args={["#eef3f4"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 5, 3]} intensity={1.8} castShadow />
      <ReferenceAnchors />
      <Probe pose={pose}hasStl={hasStl}modelAlignment={modelAlignment}modelPath={modelPath}visualizationMode={visualizationMode}selectedStructures={selectedStructures}/>
      <Grid args={[7, 7]} position={[0, -1.05, 0]} cellColor="#b9c9ce" sectionColor="#6f8f99" fadeDistance={14} />
      <ContactShadows position={[0, -1.02, 0]} opacity={0.28} blur={2.4} />
      <Environment preset="city" />
      <OrbitControls makeDefault enablePan={false} minDistance={2.4} maxDistance={8} target={[0, -0.2, 0]} />
    </Canvas>
  );
}

function DesktopApp() {
  const [room, setRoom] = useState(createRoom);
  const [pose, setPose] = useState(NEUTRAL_POSE);
  const [lastMotionAt, setLastMotionAt] = useState(null);
  const [latestMotion, setLatestMotion] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [calibratedAt, setCalibratedAt] = useState(null);
  const [modelAlignment] = useState(DEFAULT_MODEL_ALIGNMENT);
  const [hasStl, setHasStl] = useState(false);

  const [modelPath, setModelPath] = useState("");
  const [structures, setStructures] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [visualizationMode, setVisualizationMode] = useState("individual");
  const [selectedStructures, setSelectedStructures] = useState([]); //estructuras modo multiple

  const phoneUrl = `${window.location.origin}/controller/${room}`;

  const patients = [
    ...new Set(
      structures.map((structure) => structure.split("_")[0])
    ),
  ].sort((a, b) => a.localeCompare(b));

  const getPatientStructures = (structuresList, patient) => {
    return structuresList
      .filter((structure) => structure.startsWith(`${patient}_`))
      .sort((a, b) => {
        const structureA = a.split("_").slice(2).join("_");
        const structureB = b.split("_").slice(2).join("_");

        return structureA.localeCompare(structureB);
      });
  };

  const patientStructures = getPatientStructures(
    structures,
    selectedPatient
  );

  const loadStructures = () => {
    fetch("/api/structures/")
      .then((response) => response.json())
      .then((data) => {
        const newStructures = data.structures;
        setStructures(newStructures);

        if (newStructures.length === 0) {
          setSelectedPatient("");
          setModelPath("");
          return;
        }

        const sortedPatients = [
          ...new Set(
            newStructures.map((structure) => structure.split("_")[0])
          ),
        ].sort((a, b) => a.localeCompare(b));

        // Si el paciente actual sigue existiendo, lo mantenemos.
        // Si no, seleccionamos el primero.
        const patientToSelect = sortedPatients.includes(selectedPatient)
          ? selectedPatient
          : sortedPatients[0];

        const availableStructures = getPatientStructures(
          newStructures,
          patientToSelect
        );

        // Si el STL que estamos viendo sigue existiendo
        // y pertenece al paciente seleccionado, lo mantenemos.
        const currentStructure = modelPath.replace("/shared/", "");

        const structureToSelect = availableStructures.includes(currentStructure)
          ? currentStructure
          : availableStructures[0];

        setSelectedPatient(patientToSelect);
        setModelPath(`/shared/${structureToSelect}`);
      })
      .catch((error) =>
        console.error("Error al obtener estructuras:", error)
      );
  };

  const handleStructureToggle = (path) => {
    setSelectedStructures((current) => {
      if (current.includes(path)) {
        return current.filter((structure) => structure !== path);
      }

      return [...current, path];
    });
  };

  const handlePatientChange = (event) => {
    const patient = event.target.value;

    setSelectedPatient(patient);
    setSelectedStructures([]);

    const patientStructures = getPatientStructures(
      structures,
      patient
    );

    if (patientStructures.length > 0) {
      setModelPath(`/shared/${patientStructures[0]}`);
    } else {
      setModelPath("");
    }
  };

  useEffect(() => {
    loadStructures();
  }, []);

  useEffect(() => {
  if (!modelPath) {
    setHasStl(false);
    return;
  }

    fetch(modelPath, { method: "HEAD" })
      .then((response) => setHasStl(response.ok))
      .catch(() => setHasStl(false));
  }, [modelPath]);

  const handleMessage = useCallback(
    (message) => {
      if (message.type !== "motion") return;

      const motion = readMotion(message);
      setLatestMotion(motion);
      setLastMotionAt(new Date());

      if (calibration) {
        setPose(poseFromCalibratedMotion(motion, calibration));
      }
    },
    [calibration]
  );

  const { status } = useJoystickSocket(room, handleMessage);
  const calibrate = () => {
    if (!latestMotion) return;

    setCalibration(latestMotion);
    setCalibratedAt(new Date());
    setPose(NEUTRAL_POSE);
  };
  const changeRoom = () => {
    setRoom(createRoom());
    setCalibration(null);
    setCalibratedAt(null);
    setLatestMotion(null);
    setLastMotionAt(null);
    setPose(NEUTRAL_POSE);
  };
  return (
    <main className="shell">
      <section className="viewer">
        <Scene pose={pose}hasStl={hasStl}modelAlignment={modelAlignment}modelPath={modelPath}visualizationMode={visualizationMode}selectedStructures={selectedStructures}/>
      </section>
      <aside className="panel">
        <div className="brand">
          <Activity size={22} />
          <div>
            <h1>Ultrasound Joystick</h1>
            <p>Vista 3D del transductor</p>
          </div>
        </div>
        <div className="structure-controls">
        <div className="structure-field">
          <label htmlFor="patient-select">Paciente</label>

          <select
            id="patient-select"
            value={selectedPatient}
            onChange={handlePatientChange}
            disabled={patients.length === 0}
          >
            {patients.length === 0 ? (
              <option value="">No hay pacientes disponibles</option>
            ) : (
              patients.map((patient) => (
                <option key={patient} value={patient}>
                  {patient}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="structure-field">
        <label>Modo de visualización</label>

        <div className="mode-toggle">
          <span className={visualizationMode === "individual" ? "active-mode" : ""}>
            Individual
          </span>

          <button
            type="button"
            className={`toggle-switch ${
              visualizationMode === "multiple" ? "multiple" : ""
            }`}
            onClick={() =>
              setVisualizationMode(
                visualizationMode === "individual" ? "multiple" : "individual"
              )
            }
            aria-label="Cambiar modo de visualización"
          >
            <span className="toggle-thumb" />
          </button>

          <span className={visualizationMode === "multiple" ? "active-mode" : ""}>
            Múltiple
          </span>
        </div>
      </div>

      <div className="structure-field">
        <label>Estructuras cerebrales</label>

        {patientStructures.length === 0 ? (
          <span>No hay estructuras disponibles</span>
        ) : (
          patientStructures.map((structure) => {
            const parts = structure.replace(".stl", "").split("_");
            const side = parts[1] === "left" ? "Izquierdo" : "Derecho";
            const structureName = parts.slice(2).join(" ");
            const path = `/shared/${structure}`;

            const isChecked =
              visualizationMode === "individual"
                ? modelPath === path
                : selectedStructures.includes(path);

            return (
              <label key={structure}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    if (visualizationMode === "individual") {
                      setModelPath(path);
                    } else {
                      handleStructureToggle(path);
                    }
                  }}
                />

                {structureName} - {side}
              </label>
            );
          })
        )}
      </div>

        <button type="button" onClick={loadStructures}>
          Actualizar estructuras
        </button>
      </div>
        <div className="connection">
          <QRCodeSVG value={phoneUrl} size={178} level="M" includeMargin />
          <div>
            <span className="label">Sala</span>
            <strong>{room}</strong>
            <p>Control móvil</p>
          </div>
        </div>

        <div className="status-grid">
          <Status label="WebSocket" value={status} />
          <Status label="Modelo" value={hasStl ? "STL" : "procedural"} />
          <Status label="Calibración" value={calibration ? "calibrado" : "pendiente"} />
          <Status label="Movimiento" value="orientación completa" />
          <Status label="Último dato" value={lastMotionAt ? lastMotionAt.toLocaleTimeString() : "sin señal"} />
          <Status label="Referencia" value={calibratedAt ? calibratedAt.toLocaleTimeString() : "sin calibrar"} />
          <Status label="Alpha" value={latestMotion ? latestMotion.alpha.toFixed(1) : "0.0"} />
          <Status label="Beta" value={latestMotion ? latestMotion.beta.toFixed(1) : "0.0"} />
          <Status label="Gamma" value={latestMotion ? latestMotion.gamma.toFixed(1) : "0.0"} />
        </div>

        <button className="icon-button" type="button" onClick={calibrate} disabled={!latestMotion}>
          <Crosshair size={18} />
          {calibration ? "Recalibrar" : "Calibrar"}
        </button>

        <button className="icon-button secondary" type="button" onClick={changeRoom}>
          <RotateCcw size={18} />
          Nueva sala
        </button>
      </aside>
    </main>
  );
}

function Status({ label, value }) {
  return (
    <div className="status">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ControllerApp({ room }) {
  const [permission, setPermission] = useState("idle");
  const [motion, setMotion] = useState({ beta: 0, gamma: 0, alpha: 0 });
  const [sensorSupport, setSensorSupport] = useState({
    accelerometer: "checking",
    gyroscope: "checking",
  });
  const eventCountRef = useRef(0);
  const hasOrientationRef = useRef(false);
  const { send } = useJoystickSocket(room, () => {});

  useEffect(() => {
    Promise.all([readPermission("accelerometer"), readPermission("gyroscope")]).then(
      ([accelerometer, gyroscope]) => {
        setSensorSupport({
          accelerometer,
          gyroscope,
        });
      }
    );
  }, []);

  const start = async () => {
    eventCountRef.current = 0;
    hasOrientationRef.current = false;

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== "granted") {
        setPermission("denied");
        return;
      }
    }

    setPermission("waiting");
    window.setTimeout(() => {
      if (eventCountRef.current === 0) {
        setPermission("no events");
      }
    }, 1800);
  };

  const sendSensorMotion = (next) => {
    setMotion(next);
    eventCountRef.current += 1;
    setPermission("active");
    send(next);
  };

  useEffect(() => {
    if (!["waiting", "active", "no events"].includes(permission)) return undefined;

    const handleOrientation = (event) => {
      const next = {
        type: "motion",
        alpha: event.alpha || 0,
        beta: event.beta || 0,
        gamma: event.gamma || 0,
      };
      hasOrientationRef.current = true;
      sendSensorMotion(next);
    };
    const handleMotion = (event) => {
      if (hasOrientationRef.current) return;

      const acceleration = {
        x: event.accelerationIncludingGravity?.x || 0,
        y: event.accelerationIncludingGravity?.y || 0,
        z: event.accelerationIncludingGravity?.z || 0,
      };

      if (acceleration.x || acceleration.y || acceleration.z) {
        const beta = clamp((Math.atan2(acceleration.y, acceleration.z) * 180) / Math.PI, -90, 90);
        const gamma = clamp((Math.atan2(acceleration.x, acceleration.z) * 180) / Math.PI, -90, 90);
        sendSensorMotion(
          {
            type: "motion",
            alpha: motion.alpha || 0,
            beta,
            gamma,
          }
        );
      }
    };

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, [permission, send, motion.alpha]);

  return (
    <main className="controller">
      <section className="controller-card">
        <button className="primary-action" type="button" onClick={start}>
          <Gamepad2 size={20} />
          Activar sensores
        </button>

        <div className="status-grid">
          <Status label="Permiso" value={permission} />
          <Status label="Accelerometer" value={sensorSupport.accelerometer} />
          <Status label="Gyroscope" value={sensorSupport.gyroscope} />
        </div>
      </section>
    </main>
  );
}

function App() {
  const controllerMatch = window.location.pathname.match(/^\/controller\/([A-Za-z0-9_-]+)/);
  if (controllerMatch) {
    return <ControllerApp room={controllerMatch[1]} />;
  }

  return <DesktopApp />;
}

createRoot(document.getElementById("root")).render(<App />);
