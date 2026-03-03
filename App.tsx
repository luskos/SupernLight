import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, Dimensions, TouchableOpacity, Image as RNImage, Alert, PermissionsAndroid, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
    Canvas,
    Skia,
    RuntimeShader,
    useImage,
    Image,
} from '@shopify/react-native-skia';
import Slider from '@react-native-community/slider';
import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import ViewShot from 'react-native-view-shot';

const { height: screenHeight } = Dimensions.get('window');

const trinityEffect = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float threshold;
  uniform float highlightCompression;
  uniform float whiteProtection;
  uniform float bloom;
  uniform float vibrance;
  uniform float superBoost;
  uniform float shadowBoost;
  uniform float phaseStrength;
  uniform float sharpness;

  vec4 main(vec2 pos) {
    vec4 color = image.eval(pos);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    float off = 1.0; 
    vec4 avg = (image.eval(pos + vec2(off, 0.0)) + image.eval(pos - vec2(off, 0.0)) + 
                image.eval(pos + vec2(0.0, off)) + image.eval(pos - vec2(0.0, off))) / 4.0;
    
    color.rgb += (color.rgb - avg.rgb) * (sharpness / 50.0);
    color.rgb += avg.rgb * bloom;

    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    color.rgb = mix(vec3(luma), color.rgb, 1.0 + (vibrance * (1.0 - (maxC - minC))));

    if (luma < 0.2) color.rgb *= shadowBoost;
    color.rgb += luma * superBoost;
    color.rgb += sin(color.rgb * 6.28) * phaseStrength;

    float factor = 1.0 / (1.0 + exp(-8.0 * (luma - threshold)));
    color.rgb *= factor;
    color.rgb = clamp(color.rgb, 1.0 - whiteProtection, highlightCompression);
    
    return vec4(color.rgb, 1.0);
  }
`)!;

export default function App() {
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    const viewShotRef = useRef<ViewShot>(null);

    const [threshold, setThreshold] = useState(0.55);
    const [hComp, setHComp] = useState(0.95);
    const [wProt, setWProt] = useState(0.95);
    const [bloom, setBloom] = useState(0.20);
    const [vibrance, setVibrance] = useState(0.30);
    const [sBoost, setSBoost] = useState(0.35);
    const [shBoost, setShBoost] = useState(1.15);
    const [phase, setPhase] = useState(0.05);
    const [sharp, setSharp] = useState(20);

    const img = useImage(imageUri);

    React.useEffect(() => {
        if (imageUri) {
            RNImage.getSize(imageUri, (width, height) => {
                setImageSize({ width, height });
            });
        }
    }, [imageUri]);

    const requestStoragePermission = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    {
                        title: "Разрешение за запис",
                        message: "Приложението има нужда от достъп до паметта, за да запази снимки.",
                        buttonNeutral: "Питай по-късно",
                        buttonNegative: "Отказ",
                        buttonPositive: "OK"
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        return true;
    };

    const selectImage = async () => {
        const res = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
        if (res.assets?.[0]?.uri) {
            setImageUri(res.assets[0].uri);
        }
    };

    const saveImage = async () => {
        if (!viewShotRef.current || !imageUri) {
            Alert.alert('Грешка', 'Няма заредена снимка');
            return;
        }

        const hasPermission = await requestStoragePermission();
        if (!hasPermission) {
            Alert.alert('Грешка', 'Няма разрешение за запис');
            return;
        }

        try {
            const timestamp = new Date().getTime();
            const fileName = `trinity_${timestamp}.png`;

            // Пробвай първо в Downloads папката (винаги има достъп)
            const filePath = RNFS.DownloadDirectoryPath + '/TRINITY_' + fileName;

            console.log('Записвам в:', filePath);

            const uri = await viewShotRef.current.capture?.() || '';

            if (uri) {
                await RNFS.copyFile(uri, filePath);

                const exists = await RNFS.exists(filePath);
                if (exists) {
                    Alert.alert(
                        '✅ Успешно запазено!',
                        `Файл: TRINITY_${fileName}\n\n📁 Локация: Downloads папка\n\nМоже да го намериш с файлов мениджър в папка Downloads.`
                    );
                }
            }

        } catch (error) {
            console.error('Save error:', error);
            Alert.alert('❌ Грешка', 'Неуспешно запазване на изображението');
        }
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>TRINITY PRO</Text>
                </View>

                {!img || !imageSize ? (
                    <TouchableOpacity style={styles.center} onPress={selectImage}>
                        <Text style={styles.btnText}>📷 ЗАРЕДИ СНИМКА</Text>
                    </TouchableOpacity>
                ) : (
                    <>
                        <ScrollView
                            style={styles.imageScrollView}
                            contentContainerStyle={styles.imageScrollContent}
                            maximumZoomScale={3}
                            minimumZoomScale={1}
                            showsHorizontalScrollIndicator={true}
                            showsVerticalScrollIndicator={true}
                        >
                            <ViewShot
                                ref={viewShotRef}
                                options={{ format: 'png', quality: 1 }}
                            >
                                <Canvas style={{ width: imageSize.width, height: imageSize.height }}>
                                    <Image
                                        image={img}
                                        x={0}
                                        y={0}
                                        width={imageSize.width}
                                        height={imageSize.height}
                                        fit="fill"
                                    >
                                        <RuntimeShader
                                            source={trinityEffect}
                                            uniforms={{
                                                threshold,
                                                highlightCompression: hComp,
                                                whiteProtection: wProt,
                                                bloom,
                                                vibrance,
                                                superBoost: sBoost,
                                                shadowBoost: shBoost,
                                                phaseStrength: phase,
                                                sharpness: sharp
                                            }}
                                        />
                                    </Image>
                                </Canvas>
                            </ViewShot>
                        </ScrollView>

                        <Text style={styles.infoText}>
                            {imageSize?.width} x {imageSize?.height} px (оригинален размер)
                        </Text>

                        <ScrollView style={styles.controlsScroll} showsVerticalScrollIndicator={false}>
                            <SliderRow label="Threshold" val={threshold} set={setThreshold} min={0} max={1} step={0.01} />
                            <SliderRow label="Bloom" val={bloom} set={setBloom} min={0} max={1} step={0.01} />
                            <SliderRow label="Sharpness" val={sharp} set={setSharp} min={0} max={50} step={1} />
                            <SliderRow label="Vibrance" val={vibrance} set={setVibrance} min={0} max={1} step={0.01} />
                            <SliderRow label="Super Boost" val={sBoost} set={setSBoost} min={0} max={1} step={0.01} />
                            <SliderRow label="Shadow Boost" val={shBoost} set={setShBoost} min={1} max={2} step={0.01} />
                            <SliderRow label="Phase Strength" val={phase} set={setPhase} min={0} max={0.2} step={0.01} />
                            <SliderRow label="High Comp" val={hComp} set={setHComp} min={0.5} max={1.2} step={0.01} />
                            <SliderRow label="White Prot" val={wProt} set={setWProt} min={0.5} max={1} step={0.01} />

                            <View style={styles.buttonRow}>
                                <TouchableOpacity style={[styles.button, styles.changeBtn]} onPress={() => setImageUri(null)}>
                                    <Text style={styles.buttonText}>🔄 СМЕНИ</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.button, styles.saveBtn]} onPress={saveImage}>
                                    <Text style={styles.buttonText}>💾 ЗАПАЗИ</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.bottomSpacer} />
                        </ScrollView>
                    </>
                )}
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const SliderRow = ({ label, val, set, min, max, step = 0.01 }: any) => (
    <View style={styles.row}>
        <View style={styles.labelRow}>
            <Text style={styles.lbl}>{label}</Text>
            <Text style={styles.valueText}>{val.toFixed(2)}</Text>
        </View>
        <Slider
            minimumValue={min}
            maximumValue={max}
            value={val}
            onValueChange={set}
            step={step}
            minimumTrackTintColor="#007AFF"
            maximumTrackTintColor="#333"
            thumbTintColor="#fff"
        />
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000'
    },
    header: {
        padding: 15,
        borderBottomWidth: 1,
        borderColor: '#333',
        alignItems: 'center'
    },
    headerTitle: {
        color: 'gold',
        fontWeight: 'bold',
        fontSize: 20
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    btnText: {
        color: '#007AFF',
        fontSize: 18,
        fontWeight: 'bold'
    },
    imageScrollView: {
        maxHeight: screenHeight * 0.6,
        backgroundColor: '#111',
    },
    imageScrollContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoText: {
        color: '#666',
        fontSize: 12,
        textAlign: 'center',
        marginVertical: 5,
    },
    controlsScroll: {
        flex: 1,
        paddingHorizontal: 20,
    },
    row: {
        marginBottom: 15,
        backgroundColor: '#111',
        padding: 12,
        borderRadius: 10,
    },
    labelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    lbl: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    valueText: {
        color: '#007AFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        marginBottom: 20,
        gap: 10,
    },
    button: {
        flex: 1,
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
    },
    changeBtn: {
        backgroundColor: '#444',
    },
    saveBtn: {
        backgroundColor: '#007AFF',
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    bottomSpacer: {
        height: 40
    },
});
