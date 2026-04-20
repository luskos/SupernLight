import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, Dimensions, TouchableOpacity, Image as RNImage, Alert } from 'react-native';
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

// const trinityEffect = Skia.RuntimeEffect.Make(`
//   uniform shader image;
//   uniform float threshold;
//   uniform float highlightCompression;
//   uniform float whiteProtection;
//   uniform float bloom;
//   uniform float vibrance;
//   uniform float superBoost;
//   uniform float shadowBoost;
//   uniform float phaseStrength;
//   uniform float sharpness;
//
//   vec4 main(vec2 pos) {
//     vec4 color = image.eval(pos);
//     float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
//
//     float off = 1.0;
//     vec4 avg = (image.eval(pos + vec2(off, 0.0)) + image.eval(pos - vec2(off, 0.0)) +
//                 image.eval(pos + vec2(0.0, off)) + image.eval(pos - vec2(0.0, off))) / 4.0;
//
//     color.rgb += (color.rgb - avg.rgb) * (sharpness / 50.0);
//     color.rgb += avg.rgb * bloom;
//
//     float maxC = max(color.r, max(color.g, color.b));
//     float minC = min(color.r, min(color.g, color.b));
//     color.rgb = mix(vec3(luma), color.rgb, 1.0 + (vibrance * (1.0 - (maxC - minC))));
//
//     if (luma < 0.2) color.rgb *= shadowBoost;
//     color.rgb += luma * superBoost;
//     color.rgb += sin(color.rgb * 6.28) * phaseStrength;
//
//     float factor = 1.0 / (1.0 + exp(-8.0 * (luma - threshold)));
//     color.rgb *= factor;
//     color.rgb = clamp(color.rgb, 1.0 - whiteProtection, highlightCompression);
//
//     return vec4(color.rgb, 1.0);
//   }
// `)!;

//New Shader Variant with Light Bleed
//
const trinityEffect = Skia.RuntimeEffect.Make(`
uniform shader image;

// Standard
uniform float threshold;
uniform float highlightCompression;
uniform float whiteProtection;
uniform float bloom;
uniform float vibrance;
uniform float superBoost;
uniform float shadowBoost;
uniform float sharpness;
uniform float phaseStrength;
uniform float multipass;

// LEAP-MORT
uniform float leapmortIntensity;
uniform float lightBleed;
uniform float ucmGain;
uniform float ppciThreshold;
uniform float waveStrength;
uniform float waveFrequency;
uniform float hologramStrength;
uniform float temporalPersistence;

vec4 main(vec2 pos) {
    vec4 rawColor = image.eval(pos);
    vec4 color = rawColor;
    
    // ===== STANDARD EDITING (Always Applied) =====
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    // Sharpness
    float off = 1.0;
    vec4 avg = (image.eval(pos + vec2(off, 0.0)) + image.eval(pos - vec2(off, 0.0)) +
                image.eval(pos + vec2(0.0, off)) + image.eval(pos - vec2(0.0, off))) / 4.0;
    color.rgb += (color.rgb - avg.rgb) * (sharpness / 50.0);
    
    // Bloom
    color.rgb += avg.rgb * bloom;
    
    // Vibrance
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    color.rgb = mix(vec3(luma), color.rgb, 1.0 + (vibrance * (1.0 - (maxC - minC))));
    
    // Shadow boost
    if (luma < 0.2) color.rgb *= shadowBoost;
    
    // Super boost
    color.rgb += luma * superBoost;
    
    // Phase
    color.rgb += sin(color.rgb * 6.28) * phaseStrength;
    
    // Threshold
    float factor = 1.0 / (1.0 + exp(-8.0 * (luma - threshold)));
    color.rgb *= factor;
    color.rgb = clamp(color.rgb, 0.0, highlightCompression);
    
    // ===== LEAP-MORT (Only if intensity > 0) =====
    if (leapmortIntensity > 0.01) {
        vec2 uv = pos / vec2(100.0);
        vec2 center = vec2(0.5, 0.5);
        vec2 delta = uv - center;
        float dist = length(delta);
        float angle = atan(delta.y, delta.x);
        
        // Volumetric Bleed
        float bleed = 0.0;
        float totalWeight = 0.0;
        for (int i = 0; i < 6; i++) {
            float ang = float(i) * 1.0472;
            vec2 dir = vec2(cos(ang), sin(ang));
            float sampleDist = lightBleed * 10.0;
            
            vec4 sample = image.eval(pos + dir * sampleDist);
            float sampleLuma = dot(sample.rgb, vec3(0.299, 0.587, 0.114));
            float amplification = 1.0 + sampleLuma * ucmGain;
            bleed += sampleLuma * amplification;
            totalWeight += 1.0;
        }
        bleed /= max(totalWeight, 0.001);
        vec3 bleedColor = vec3(bleed * 0.7, bleed * 1.1, bleed * 0.9);
        
        // Wave Interference
        float phase1 = (uv.x * waveFrequency) * 6.28318;
        float phase2 = (uv.y * waveFrequency * 0.7) * 6.28318;
        float wave1 = cos(phase1) * 0.5 + 0.5;
        float wave2 = sin(phase2) * 0.5 + 0.5;
        float interference = wave1 * wave2;
        vec3 holographicColor = vec3(0.2, 0.9, 0.3);
        
        // Apply LEAP-MORT (additive, doesn't break standard edits)
        vec3 leapAdd = bleedColor * lightBleed * leapmortIntensity;
        leapAdd += holographicColor * interference * waveStrength * leapmortIntensity;
        color.rgb += leapAdd;
    }
    
    // Multipass blend
    return mix(color, rawColor, multipass);
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

    const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
    const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

    const [lightBleed, setLightBleed] = useState(0);

    const [multipass, setMultipass] = useState(0);

    //const [lightBleed, setLightBleed] = useState(0.15);
    // LEAP-MORT states - use DIFFERENT names to avoid conflict
    const [lmLightBleed, setLmLightBleed] = useState(0.15);
    const [ucmGain, setUcmGain] = useState(2.5);
    const [ppciThreshold, setPpciThreshold] = useState(0.3);
    const [waveStrength, setWaveStrength] = useState(0.2);
    const [waveFrequency, setWaveFrequency] = useState(5.0);
    const [hologramStrength, setHologramStrength] = useState(0.15);
    const [temporalPersistence, setTemporalPersistence] = useState(0.6);
    const [leapmortIntensity, setLeapmortIntensity] = useState(0.7);
    // React.useEffect(() => {
    //     if (imageUri) {
    //         RNImage.getSize(imageUri, (width, height) => {
    //             setImageSize({ width, height });
    //         });
    //     }
    // }, [imageUri]);
    React.useEffect(() => {
        if (imageUri) {
            RNImage.getSize(imageUri, (width, height) => {
                setImageSize({ width, height });

                const maxWidth = Dimensions.get('window').width - 40;
                const maxHeight = screenHeight * 0.5;
                const ratio = Math.min(maxWidth / width, maxHeight / height);

                setPreviewSize({ width: width * ratio, height: height * ratio });
            });
        }
    }, [imageUri]);

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

        try {
            const timestamp = new Date().getTime();
            const fileName = `trinity_${timestamp}.png`;
            const filePath = RNFS.DownloadDirectoryPath + '/' + fileName;

            const uri = await viewShotRef.current.capture?.() || '';

            if (uri) {
                await RNFS.copyFile(uri, filePath);

                const exists = await RNFS.exists(filePath);
                if (exists) {
                    Alert.alert(
                        'Успешно запазено!',
                        `Файлът е запазен в:\n${filePath}`
                    );
                }
            }

        } catch (error) {
            console.error('Save error:', error);
            Alert.alert('Грешка', 'Неуспешно запазване на изображението');
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
                        {/*<ScrollView*/}
                        {/*    style={styles.imageScrollView}*/}
                        {/*    contentContainerStyle={styles.imageScrollContent}*/}
                        {/*    maximumZoomScale={3}*/}
                        {/*    minimumZoomScale={1}*/}
                        {/*    showsHorizontalScrollIndicator={true}*/}
                        {/*    showsVerticalScrollIndicator={true}*/}
                        {/*>*/}
                        {/*    <ViewShot*/}
                        {/*        ref={viewShotRef}*/}
                        {/*        options={{ format: 'png', quality: 1 }}*/}
                        {/*    >*/}
                        {/*        <Canvas style={{ width: imageSize.width, height: imageSize.height }}>*/}
                        {/*            <Image*/}
                        {/*                image={img}*/}
                        {/*                x={0}*/}
                        {/*                y={0}*/}
                        {/*                width={imageSize.width}*/}
                        {/*                height={imageSize.height}*/}
                        {/*                fit="fill"*/}
                        {/*            >*/}
                        {/*                <RuntimeShader*/}
                        {/*                    source={trinityEffect}*/}
                        {/*                    uniforms={{*/}
                        {/*                        threshold,*/}
                        {/*                        highlightCompression: hComp,*/}
                        {/*                        whiteProtection: wProt,*/}
                        {/*                        bloom,*/}
                        {/*                        vibrance,*/}
                        {/*                        superBoost: sBoost,*/}
                        {/*                        shadowBoost: shBoost,*/}
                        {/*                        phaseStrength: phase,*/}
                        {/*                        sharpness: sharp*/}
                        {/*                    }}*/}
                        {/*                />*/}
                        {/*            </Image>*/}
                        {/*        </Canvas>*/}
                        {/*    </ViewShot>*/}
                        {/*</ScrollView>*/}
                        <View style={{ position: 'absolute', opacity: 0, zIndex: -1 }}>
                            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
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
                                                // Standard
                                                threshold,
                                                highlightCompression: hComp,
                                                whiteProtection: wProt,
                                                bloom,
                                                vibrance,
                                                superBoost: sBoost,
                                                shadowBoost: shBoost,
                                                sharpness: sharp,
                                                phaseStrength: phase,
                                                multipass,

                                                // LEAP-MORT (using the renamed states)
                                                leapmortIntensity,
                                                lightBleed: lmLightBleed,
                                                ucmGain,
                                                ppciThreshold,
                                                waveStrength,
                                                waveFrequency,
                                                hologramStrength,
                                                temporalPersistence,
                                            }}
                                        />
                                    </Image>
                                </Canvas>
                            </ViewShot>
                        </View>

                        {/* ВИДИМ PREVIEW */}
                        <ScrollView
                            horizontal
                            maximumZoomScale={3}
                            minimumZoomScale={1}
                            showsHorizontalScrollIndicator={true}
                            showsVerticalScrollIndicator={true}
                            style={styles.imageScrollView}
                            contentContainerStyle={styles.imageScrollCentered}
                        >
                            <View style={{ height: screenHeight * 0.6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
                                <Canvas style={{ width: screenWidth - 40, height: (imageSize.height / imageSize.width) * (screenWidth - 40) }}>
                                    <Image
                                        image={img}
                                        x={0}
                                        y={0}
                                        width={screenWidth - 40}
                                        height={(imageSize.height / imageSize.width) * (screenWidth - 40)}
                                        fit="fill"
                                    >
                                        <RuntimeShader
                                            source={trinityEffect}
                                            uniforms={{
                                                // Standard
                                                threshold,
                                                highlightCompression: hComp,
                                                whiteProtection: wProt,
                                                bloom,
                                                vibrance,
                                                superBoost: sBoost,
                                                shadowBoost: shBoost,
                                                sharpness: sharp,
                                                phaseStrength: phase,
                                                multipass,

                                                // LEAP-MORT (using the renamed states)
                                                leapmortIntensity,
                                                lightBleed: lmLightBleed,
                                                ucmGain,
                                                ppciThreshold,
                                                waveStrength,
                                                waveFrequency,
                                                hologramStrength,
                                                temporalPersistence,
                                            }}
                                        />
                                    </Image>
                                </Canvas>
                            </View>
                        </ScrollView>




                        <Text style={styles.infoText}>
                            {imageSize?.width} x {imageSize?.height} px (оригинален размер)
                        </Text>

                        <ScrollView style={styles.controlsScroll} showsVerticalScrollIndicator={false}>
                            <Text style={styles.sectionHeader}>📷 STANDARD EDITING</Text>
                            <SliderRow label="Threshold" val={threshold} set={setThreshold} min={0} max={1} step={0.01} />
                            <SliderRow label="Bloom" val={bloom} set={setBloom} min={0} max={1} step={0.01} />
                            <SliderRow label="Sharpness" val={sharp} set={setSharp} min={0} max={50} step={1} />
                            <SliderRow label="Vibrance" val={vibrance} set={setVibrance} min={0} max={1} step={0.01} />
                            <SliderRow label="Super Boost" val={sBoost} set={setSBoost} min={0} max={1} step={0.01} />
                            <SliderRow label="Shadow Boost" val={shBoost} set={setShBoost} min={1} max={2} step={0.01} />
                            <SliderRow label="Phase Strength" val={phase} set={setPhase} min={0} max={0.2} step={0.01} />
                            <SliderRow label="High Comp" val={hComp} set={setHComp} min={0.5} max={1.2} step={0.01} />
                            <SliderRow label="Multipass" val={multipass} set={setMultipass} min={0} max={1} step={0.01} />

                            <Text style={styles.sectionHeader}>🌊 LEAP-MORT EFFECTS</Text>
                            <SliderRow label="Master Intensity" val={leapmortIntensity} set={setLeapmortIntensity} min={0} max={1} step={0.01} />
                            <SliderRow label="Light Bleed" val={lmLightBleed} set={setLmLightBleed} min={0} max={0.5} step={0.01} />
                            <SliderRow label="UCM Gain" val={ucmGain} set={setUcmGain} min={0} max={5} step={0.1} />
                            <SliderRow label="Wave Strength" val={waveStrength} set={setWaveStrength} min={0} max={0.5} step={0.01} />
                            <SliderRow label="Wave Frequency" val={waveFrequency} set={setWaveFrequency} min={1} max={20} step={0.5} />
                            <SliderRow label="Hologram" val={hologramStrength} set={setHologramStrength} min={0} max={0.3} step={0.01} />

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
    imageScrollCentered: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    // imageScrollView: {
    //     maxHeight: screenHeight * 0.6,
    //     backgroundColor: '#111',
    // },
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
    sectionHeader: {
        color: '#00FF88',
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 15,
        marginBottom: 10,
    },
    subHeader: {
        color: '#888',
        fontSize: 13,
        marginTop: 5,
        marginBottom: 5,
    },
});
