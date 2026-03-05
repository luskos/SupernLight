import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
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

const { width } = Dimensions.get('window');

// ТОЧНАТА МАТЕМАТИКА ОТ PYTHON ФАЙЛА
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
    
    // SHARPEN & BLOOM (Kernel)
    vec4 avg = (image.eval(pos + vec2(1.5, 0.0)) + image.eval(pos - vec2(1.5, 0.0)) + 
                image.eval(pos + vec2(0.0, 1.5)) + image.eval(pos - vec2(0.0, 1.5))) / 4.0;
    
    color.rgb += (color.rgb - avg.rgb) * (sharpness / 50.0);
    color.rgb += avg.rgb * bloom;

    // VIBRANCE
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    color.rgb = mix(vec3(luma), color.rgb, 1.0 + (vibrance * (1.0 - (maxC - minC))));

    // BOOSTS
    if (luma < 0.2) color.rgb *= shadowBoost;
    color.rgb += luma * superBoost;
    color.rgb += sin(color.rgb * 6.28) * phaseStrength;

    // THRESHOLD (Sigmoid)
    float factor = 1.0 / (1.0 + exp(-8.0 * (luma - threshold)));
    color.rgb *= factor;
    
    // FINAL CLAMP
    color.rgb = clamp(color.rgb, 1.0 - whiteProtection, highlightCompression);
    
    return vec4(color.rgb, 1.0);
  }
`)!;

export default function App() {
    const [imageUri, setImageUri] = useState<string | null>(null);

    // Стойности в реално време
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

    const selectImage = async () => {
        const res = await launchImageLibrary({ mediaType: 'photo', quality: 1 });
        if (res.assets?.[0]?.uri) setImageUri(res.assets[0].uri);
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}><Text style={styles.headerTitle}>TRINITY REAL-TIME</Text></View>

                {!img ? (
                    <TouchableOpacity style={styles.center} onPress={selectImage}>
                        <Text style={styles.btnText}>📷 ЗАРЕДИ СНИМКА</Text>
                    </TouchableOpacity>
                ) : (
                    <>
                        <Canvas style={styles.canvas}>
                            <Image image={img} x={0} y={0} width={width} height={width} fit="cover">
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

                        <ScrollView style={styles.scroll}>
                            <SliderRow label="Threshold" val={threshold} set={setThreshold} min={0} max={1} />
                            <SliderRow label="Bloom" val={bloom} set={setBloom} min={0} max={1} />
                            <SliderRow label="Sharpness" val={sharp} set={setSharp} min={0} max={50} />
                            <SliderRow label="Super Boost" val={sBoost} set={setSBoost} min={0} max={1} />
                            <SliderRow label="Shadow Boost" val={shBoost} set={setShBoost} min={1} max={2} />
                            <SliderRow label="Vibrance" val={vibrance} set={setVibrance} min={0} max={1} />
                            <SliderRow label="Phase" val={phase} set={setPhase} min={0} max={0.2} />
                            <SliderRow label="White Prot" val={wProt} set={setWProt} min={0.5} max={1} />
                            <SliderRow label="High Comp" val={hComp} set={setHComp} min={0.5} max={1} />

                            <TouchableOpacity style={styles.reset} onPress={() => setImageUri(null)}>
                                <Text style={styles.resetText}>СМЕНИ СНИМКА</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </>
                )}
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const SliderRow = ({ label, val, set, min, max }: any) => (
    <View style={styles.row}>
        <Text style={styles.lbl}>{label}: {val.toFixed(2)}</Text>
        <Slider
            minimumValue={min} maximumValue={max}
            value={val} onValueChange={set}
            minimumTrackTintColor="#007AFF" thumbTintColor="#fff"
        />
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { padding: 15, borderBottomWidth: 1, borderColor: '#333', alignItems: 'center' },
    headerTitle: { color: 'gold', fontWeight: 'bold', fontSize: 20 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#007AFF', fontSize: 18, fontWeight: 'bold' },
    canvas: { width: width, height: width },
    scroll: { flex: 1, padding: 20 },
    row: { marginBottom: 15 },
    lbl: { color: '#ccc', fontSize: 12, marginBottom: 5 },
    reset: { backgroundColor: '#444', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, marginBottom: 40 },
    resetText: { color: '#fff', fontWeight: 'bold' }
});