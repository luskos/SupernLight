import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, Dimensions, TouchableOpacity, Image as RNImage, Alert, PermissionsAndroid, Platform, SectionList } from 'react-native';
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

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

// Разширен шейдър с всички Lightroom ефекти
const trinityEffect = Skia.RuntimeEffect.Make(`
  uniform shader image;
  
  // Основни настройки
  uniform float exposure;
  uniform float contrast;
  uniform float temp;
  uniform float tint;
  
  // Светлини и сенки
  uniform float highlights;
  uniform float shadows;
  uniform float whites;
  uniform float blacks;
  
  // Текстура и детайли
  uniform float texture;
  uniform float clarity;
  uniform float dehaze;
  
  // Цветове
  uniform float saturation;
  uniform float vibrance;
  
  // RGB канали
  uniform float redGain;
  uniform float greenGain;
  uniform float blueGain;
  
  // Color Grading
  uniform float colorGradeHue;
  uniform float colorGradeSaturation;
  uniform float colorGradeBalance;
  
  // Ефекти
  uniform float vignette;
  uniform float chromaticAberration;
  uniform float grain;
  
  // Острина и Bloom (стари параметри)
  uniform float sharpness;
  uniform float bloom;
  uniform float phaseStrength;

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  vec4 main(vec2 pos) {
    vec4 color = image.eval(pos);
    vec3 rgb = color.rgb;
    
    // 1. Температура и tint (бял баланс)
    rgb.r += temp * 0.1;
    rgb.b -= temp * 0.1;
    rgb.g += tint * 0.1;
    rgb.rb += tint * 0.05;
    
    // 2. Експозиция
    rgb *= pow(2.0, exposure);
    
    // 3. Контраст (S-крива)
    rgb = (rgb - 0.5) * contrast + 0.5;
    
    // 4. Светлини и сенки
    float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
    
    // Highlights (само за светлите части)
    if (luma > 0.5) {
        rgb += (rgb - 0.5) * highlights * 0.5;
    }
    
    // Shadows (само за тъмните части)
    if (luma < 0.5) {
        rgb -= (0.5 - rgb) * shadows * 0.5;
    }
    
    // Whites и Blacks (крайности)
    rgb = mix(rgb, vec3(1.0), whites * step(0.8, luma));
    rgb = mix(rgb, vec3(0.0), blacks * step(luma, 0.2));
    
    // 5. Текстура (микро-контраст)
    if (texture > 0.01) {
        vec2 off = vec2(0.5, 0.5);
        vec3 blur = (image.eval(pos + off).rgb + image.eval(pos - off).rgb) * 0.5;
        rgb += (rgb - blur) * texture;
    }
    
    // 6. Яснота (по-голям радиус)
    if (clarity > 0.01) {
        vec2 off = vec2(2.0, 2.0);
        vec3 blur = (image.eval(pos + off).rgb + image.eval(pos - off).rgb) * 0.5;
        rgb += (rgb - blur) * clarity;
    }
    
    // 7. Dehaze (премахване на мъгла)
    if (dehaze > 0.01) {
        rgb = mix(rgb, rgb * rgb, dehaze);
    }
    
    // 8. RGB канали
    rgb.r *= redGain;
    rgb.g *= greenGain;
    rgb.b *= blueGain;
    
    // 9. Вибрантност и наситеност
    float maxC = max(rgb.r, max(rgb.g, rgb.b));
    float minC = min(rgb.r, min(rgb.g, rgb.b));
    float sat = maxC - minC;
    
    // Вибрантност (по-интелигентна наситеност)
    rgb = mix(vec3(luma), rgb, 1.0 + vibrance * (1.0 - sat));
    
    // Наситеност (директна)
    vec3 gray = vec3(luma);
    rgb = mix(gray, rgb, 1.0 + saturation);
    
    // 10. Color Grading (HSV трансформация)
    vec3 hsv = rgb2hsv(rgb);
    hsv.x += colorGradeHue;
    hsv.y *= (1.0 + colorGradeSaturation);
    rgb = hsv2rgb(hsv);
    
    // Balance (смесване на тоновете)
    rgb = mix(rgb, rgb.gbr, colorGradeBalance * 0.5);
    
    // 11. Винетка
    vec2 center = vec2(0.5, 0.5);
    vec2 uv = pos / vec2(textureSize(image, 0));
    float dist = distance(uv, center);
    float vignetteAmount = 1.0 - vignette * dist * 2.0;
    rgb *= vignetteAmount;
    
    // 12. Хроматична аберация
    if (chromaticAberration > 0.01) {
        float amount = chromaticAberration * 2.0;
        float r = image.eval(pos + vec2(amount, 0.0)).r;
        float g = image.eval(pos).g;
        float b = image.eval(pos - vec2(amount, 0.0)).b;
        rgb = vec3(r, g, b);
    }
    
    // 13. Зърно (grain)
    if (grain > 0.01) {
        float noise = fract(sin(dot(pos, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        rgb += noise * grain;
    }
    
    // 14. Bloom (стар параметър)
    if (bloom > 0.01) {
        vec4 blurred = (image.eval(pos + vec2(1.0, 0.0)) + 
                        image.eval(pos - vec2(1.0, 0.0)) + 
                        image.eval(pos + vec2(0.0, 1.0)) + 
                        image.eval(pos - vec2(0.0, 1.0))) / 4.0;
        rgb = mix(rgb, blurred.rgb, bloom * 0.3);
    }
    
    // 15. Фазова сила (стар параметър)
    if (phaseStrength > 0.01) {
        rgb += sin(rgb * 6.28) * phaseStrength * 0.1;
    }
    
    // 16. Острина
    if (sharpness > 0.1) {
        vec4 left = image.eval(pos + vec2(-1.0, 0.0));
        vec4 right = image.eval(pos + vec2(1.0, 0.0));
        vec4 up = image.eval(pos + vec2(0.0, -1.0));
        vec4 down = image.eval(pos + vec2(0.0, 1.0));
        vec4 blurred = (left + right + up + down) / 4.0;
        rgb = mix(rgb, rgb + (rgb - blurred.rgb) * (sharpness / 50.0), 0.5);
    }
    
    return vec4(clamp(rgb, 0.0, 1.0), 1.0);
  }
`)!;

// Секции за слайдерите
const SECTIONS = [
    {
        title: '⚙️ ОСНОВНИ',
        data: [
            { label: 'Exposure', key: 'exposure', min: -2, max: 2, step: 0.1, default: 0 },
            { label: 'Contrast', key: 'contrast', min: 0, max: 2, step: 0.1, default: 1 },
            { label: 'Temp', key: 'temp', min: -1, max: 1, step: 0.1, default: 0 },
            { label: 'Tint', key: 'tint', min: -1, max: 1, step: 0.1, default: 0 },
        ]
    },
    {
        title: '☀️ СВЕТЛИНИ И СЕНКИ',
        data: [
            { label: 'Highlights', key: 'highlights', min: -1, max: 1, step: 0.1, default: 0 },
            { label: 'Shadows', key: 'shadows', min: -1, max: 1, step: 0.1, default: 0 },
            { label: 'Whites', key: 'whites', min: 0, max: 1, step: 0.1, default: 0 },
            { label: 'Blacks', key: 'blacks', min: 0, max: 1, step: 0.1, default: 0 },
        ]
    },
    {
        title: '✨ ТЕКСТУРА И ДЕТАЙЛИ',
        data: [
            { label: 'Texture', key: 'texture', min: 0, max: 1, step: 0.1, default: 0 },
            { label: 'Clarity', key: 'clarity', min: 0, max: 1, step: 0.1, default: 0 },
            { label: 'Dehaze', key: 'dehaze', min: 0, max: 1, step: 0.1, default: 0 },
            { label: 'Sharpness', key: 'sharpness', min: 0, max: 50, step: 1, default: 20 },
        ]
    },
    {
        title: '🎨 ЦВЕТОВЕ',
        data: [
            { label: 'Saturation', key: 'saturation', min: -1, max: 1, step: 0.1, default: 0 },
            { label: 'Vibrance', key: 'vibrance', min: 0, max: 1, step: 0.1, default: 0.3 },
            { label: 'Red Gain', key: 'redGain', min: 0, max: 2, step: 0.1, default: 1 },
            { label: 'Green Gain', key: 'greenGain', min: 0, max: 2, step: 0.1, default: 1 },
            { label: 'Blue Gain', key: 'blueGain', min: 0, max: 2, step: 0.1, default: 1 },
        ]
    },
    {
        title: '🌈 COLOR GRADING',
        data: [
            { label: 'Grade Hue', key: 'colorGradeHue', min: -1, max: 1, step: 0.1, default: 0 },
            { label: 'Grade Saturation', key: 'colorGradeSaturation', min: -1, max: 1, step: 0.1, default: 0 },
            { label: 'Grade Balance', key: 'colorGradeBalance', min: -1, max: 1, step: 0.1, default: 0 },
        ]
    },
    {
        title: '💫 ЕФЕКТИ',
        data: [
            { label: 'Bloom', key: 'bloom', min: 0, max: 1, step: 0.1, default: 0.2 },
            { label: 'Vignette', key: 'vignette', min: 0, max: 1, step: 0.1, default: 0 },
            { label: 'Chromatic Aberration', key: 'chromaticAberration', min: 0, max: 1, step: 0.1, default: 0 },
            { label: 'Grain', key: 'grain', min: 0, max: 0.5, step: 0.05, default: 0 },
            { label: 'Phase', key: 'phaseStrength', min: 0, max: 0.2, step: 0.01, default: 0.05 },
        ]
    },
];

export default function App() {
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    const viewShotRef = useRef<ViewShot>(null);

    // Състояния за всички слайдери
    const [exposure, setExposure] = useState(0);
    const [contrast, setContrast] = useState(1);
    const [temp, setTemp] = useState(0);
    const [tint, setTint] = useState(0);
    const [highlights, setHighlights] = useState(0);
    const [shadows, setShadows] = useState(0);
    const [whites, setWhites] = useState(0);
    const [blacks, setBlacks] = useState(0);
    const [texture, setTexture] = useState(0);
    const [clarity, setClarity] = useState(0);
    const [dehaze, setDehaze] = useState(0);
    const [saturation, setSaturation] = useState(0);
    const [vibrance, setVibrance] = useState(0.3);
    const [redGain, setRedGain] = useState(1);
    const [greenGain, setGreenGain] = useState(1);
    const [blueGain, setBlueGain] = useState(1);
    const [colorGradeHue, setColorGradeHue] = useState(0);
    const [colorGradeSaturation, setColorGradeSaturation] = useState(0);
    const [colorGradeBalance, setColorGradeBalance] = useState(0);
    const [vignette, setVignette] = useState(0);
    const [chromaticAberration, setChromaticAberration] = useState(0);
    const [grain, setGrain] = useState(0);
    const [bloom, setBloom] = useState(0.2);
    const [phaseStrength, setPhaseStrength] = useState(0.05);
    const [sharpness, setSharpness] = useState(20);

    const img = useImage(imageUri);

    useEffect(() => {
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
            const filePath = RNFS.DownloadDirectoryPath + '/TRINITY_' + fileName;

            const uri = await viewShotRef.current.capture?.() || '';

            if (uri) {
                await RNFS.copyFile(uri, filePath);
                Alert.alert('✅ Успешно!', `Запазено в Downloads папка`);
            }
        } catch (error) {
            Alert.alert('❌ Грешка', 'Неуспешно запазване');
        }
    };

    const resetToDefault = () => {
        setExposure(0);
        setContrast(1);
        setTemp(0);
        setTint(0);
        setHighlights(0);
        setShadows(0);
        setWhites(0);
        setBlacks(0);
        setTexture(0);
        setClarity(0);
        setDehaze(0);
        setSaturation(0);
        setVibrance(0.3);
        setRedGain(1);
        setGreenGain(1);
        setBlueGain(1);
        setColorGradeHue(0);
        setColorGradeSaturation(0);
        setColorGradeBalance(0);
        setVignette(0);
        setChromaticAberration(0);
        setGrain(0);
        setBloom(0.2);
        setPhaseStrength(0.05);
        setSharpness(20);
    };

    const renderSlider = ({ item }: any) => {
        const { label, key, min, max, step } = item;
        
        let value, setValue;
        switch(key) {
            case 'exposure': value = exposure; setValue = setExposure; break;
            case 'contrast': value = contrast; setValue = setContrast; break;
            case 'temp': value = temp; setValue = setTemp; break;
            case 'tint': value = tint; setValue = setTint; break;
            case 'highlights': value = highlights; setValue = setHighlights; break;
            case 'shadows': value = shadows; setValue = setShadows; break;
            case 'whites': value = whites; setValue = setWhites; break;
            case 'blacks': value = blacks; setValue = setBlacks; break;
            case 'texture': value = texture; setValue = setTexture; break;
            case 'clarity': value = clarity; setValue = setClarity; break;
            case 'dehaze': value = dehaze; setValue = setDehaze; break;
            case 'saturation': value = saturation; setValue = setSaturation; break;
            case 'vibrance': value = vibrance; setValue = setVibrance; break;
            case 'redGain': value = redGain; setValue = setRedGain; break;
            case 'greenGain': value = greenGain; setValue = setGreenGain; break;
            case 'blueGain': value = blueGain; setValue = setBlueGain; break;
            case 'colorGradeHue': value = colorGradeHue; setValue = setColorGradeHue; break;
            case 'colorGradeSaturation': value = colorGradeSaturation; setValue = setColorGradeSaturation; break;
            case 'colorGradeBalance': value = colorGradeBalance; setValue = setColorGradeBalance; break;
            case 'vignette': value = vignette; setValue = setVignette; break;
            case 'chromaticAberration': value = chromaticAberration; setValue = setChromaticAberration; break;
            case 'grain': value = grain; setValue = setGrain; break;
            case 'bloom': value = bloom; setValue = setBloom; break;
            case 'phaseStrength': value = phaseStrength; setValue = setPhaseStrength; break;
            case 'sharpness': value = sharpness; setValue = setSharpness; break;
            default: return null;
        }

        return (
            <View style={styles.sliderRow}>
                <View style={styles.sliderHeader}>
                    <Text style={styles.sliderLabel}>{label}</Text>
                    <Text style={styles.sliderValue}>{value.toFixed(2)}</Text>
                </View>
                <Slider
                    style={styles.slider}
                    minimumValue={min}
                    maximumValue={max}
                    value={value}
                    onValueChange={setValue}
                    step={step}
                    minimumTrackTintColor="#007AFF"
                    maximumTrackTintColor="#333"
                    thumbTintColor="#fff"
                />
            </View>
        );
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>TRINITY PRO</Text>
                    <TouchableOpacity onPress={resetToDefault} style={styles.resetButton}>
                        <Text style={styles.resetButtonText}>↺ RESET</Text>
                    </TouchableOpacity>
                </View>

                {!img || !imageSize ? (
                    <TouchableOpacity style={styles.center} onPress={selectImage}>
                        <Text style={styles.btnText}>📷 ИЗБЕРИ СНИМКА</Text>
                    </TouchableOpacity>
                ) : (
                    <>
                        <ScrollView
                            style={styles.imageScrollView}
                            contentContainerStyle={styles.imageScrollContent}
                            maximumZoomScale={3}
                            minimumZoomScale={1}
                        >
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
                                                exposure,
                                                contrast,
                                                temp,
                                                tint,
                                                highlights,
                                                shadows,
                                                whites,
                                                blacks,
                                                texture,
                                                clarity,
                                                dehaze,
                                                saturation,
                                                vibrance,
                                                redGain,
                                                greenGain,
                                                blueGain,
                                                colorGradeHue,
                                                colorGradeSaturation,
                                                colorGradeBalance,
                                                vignette,
                                                chromaticAberration,
                                                grain,
                                                bloom,
                                                phaseStrength,
                                                sharpness
                                            }}
                                        />
                                    </Image>
                                </Canvas>
                            </ViewShot>
                        </ScrollView>

                        <Text style={styles.infoText}>
                            {imageSize.width} x {imageSize.height} px
                        </Text>

                        <SectionList
                            sections={SECTIONS}
                            renderItem={renderSlider}
                            renderSectionHeader={({ section }) => (
                                <Text style={styles.sectionHeader}>{section.title}</Text>
                            )}
                            style={styles.controlsList}
                            showsVerticalScrollIndicator={false}
                            stickySectionHeadersEnabled={true}
                        />

                        <View style={styles.footer}>
                            <TouchableOpacity style={styles.footerButton} onPress={selectImage}>
                                <Text style={styles.footerButtonText}>📁</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.footerButton, styles.saveFooterButton]} onPress={saveImage}>
                                <Text style={styles.footerButtonText}>💾</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: '#333',
    },
    headerTitle: {
        color: 'gold',
        fontWeight: 'bold',
        fontSize: 18,
    },
    resetButton: {
        backgroundColor: '#8B0000',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    resetButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnText: {
        color: '#007AFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    imageScrollView: {
        maxHeight: screenHeight * 0.5,
        backgroundColor: '#111',
    },
    imageScrollContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoText: {
        color: '#666',
        fontSize: 11,
        textAlign: 'center',
        marginVertical: 4,
    },
    controlsList: {
        flex: 1,
        paddingHorizontal: 12,
    },
    sectionHeader: {
        color: 'gold',
        fontSize: 14,
        fontWeight: 'bold',
        backgroundColor: '#1a1a1a',
        paddingVertical: 8,
        paddingHorizontal: 10,
        marginTop: 10,
        borderRadius: 6,
    },
    sliderRow: {
        backgroundColor: '#111',
        padding: 10,
        borderRadius: 8,
        marginBottom: 8,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    sliderLabel: {
        color: '#fff',
        fontSize: 13,
    },
    sliderValue: {
        color: '#007AFF',
        fontSize: 13,
        fontWeight: 'bold',
    },
    slider: {
        width: '100%',
        height: 30,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderColor: '#333',
        backgroundColor: '#0a0a0a',
    },
    footerButton: {
        backgroundColor: '#333',
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveFooterButton: {
        backgroundColor: '#007AFF',
    },
    footerButtonText: {
        color: '#fff',
        fontSize: 20,
    },
});