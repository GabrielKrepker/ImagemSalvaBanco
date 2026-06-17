import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
} from 'firebase/firestore';

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCFTszv1VP2hGFFu97VXt_ZMdfNOwdhTmQ",
  authDomain: "atividaderomualdo.firebaseapp.com",
  projectId: "atividaderomualdo",
  storageBucket: "atividaderomualdo.firebasestorage.app",
  messagingSenderId: "500208648204",
  appId: "1:500208648204:web:0cf21ad8261a51bdb7ee29",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ─── Cloudinary ──────────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = 'dvtjxsfjh';
const CLOUDINARY_UPLOAD_PRESET = 'TrabalhoRomualdo';

// ─── Funções auxiliares ───────────────────────────────────────────────────────
const uploadToCloudinary = async (uri) => {
  const formData = new FormData();
  formData.append('file', { uri, type: 'image/jpeg', name: `photo_${Date.now()}.jpg` });
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  if (!res.ok) throw new Error('Falha no upload para Cloudinary');
  const data = await res.json();
  return data.secure_url;
};

const saveToFirestore = async (imageUrl, latitude, longitude) => {
  const docRef = await addDoc(collection(db, 'markers'), {
    imageUrl,
    latitude,
    longitude,
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
};

const deleteFromFirestore = async (id) => {
  await deleteDoc(doc(db, 'markers', id));
};

const loadMarkersFromFirestore = async () => {
  const snapshot = await getDocs(collection(db, 'markers'));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Acesso à localização necessário.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);

      try {
        const saved = await loadMarkersFromFirestore();
        setMarkers(saved);
      } catch (e) {
        console.warn('Erro ao carregar markers:', e);
      }
    })();
  }, []);

  const openCamera = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permissão negada', 'Acesso à câmera necessário.');
        return;
      }
    }
    setCameraVisible(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      setCameraVisible(false);

      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;

      const imageUrl = await uploadToCloudinary(photo.uri);
      const id = await saveToFirestore(imageUrl, latitude, longitude);

      setMarkers((prev) => [...prev, { id, imageUrl, latitude, longitude }]);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível salvar a foto: ' + err.message);
    }
  };

  const handleLongPress = (marker) => {
    Alert.alert(
      'Excluir marker',
      'Deseja excluir este marker e sua foto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFromFirestore(marker.id);
              setMarkers((prev) => prev.filter((m) => m.id !== marker.id));
              if (selectedMarker?.id === marker.id) setSelectedMarker(null);
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível excluir o marker.');
            }
          },
        },
      ]
    );
  };

  if (!location) {
    return (
      <View style={styles.loading}>
        <Text>Obtendo localização...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            onPress={() =>
              setSelectedMarker(selectedMarker?.id === marker.id ? null : marker)
            }
            onLongPress={() => handleLongPress(marker)}
          />
        ))}
      </MapView>

      {selectedMarker && (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: selectedMarker.imageUrl }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <TouchableOpacity
            style={styles.closePreview}
            onPress={() => setSelectedMarker(null)}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.cameraButton} onPress={openCamera}>
        <Text style={styles.cameraButtonText}>📷</Text>
      </TouchableOpacity>

      <Modal visible={cameraVisible} animationType="slide">
        <CameraView style={styles.camera} ref={cameraRef} facing="back">
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setCameraVisible(false)}
            >
              <Text style={styles.controlText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shutterButton} onPress={takePicture}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  previewContainer: {
    position: 'absolute',
    top: 120,
    right: 20,
    width: 140,
    height: 180,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  previewImage: { width: '100%', height: '100%' },
  closePreview: {
    position: 'absolute',
    top: 4,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 2,
  },
  closeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  cameraButton: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 40,
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  cameraButtonText: { fontSize: 32 },
  camera: { flex: 1 },
  cameraControls: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  cancelButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  controlText: { color: '#fff', fontSize: 16 },
  shutterButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
  },
});