import React, { useState, useEffect } from 'react';
import { Image, View, LayoutChangeEvent, ImageSourcePropType, StyleSheet } from 'react-native';

interface AspectImageProps {
  source: ImageSourcePropType;
  maxHeight?: number;
  maxWidth?: number;
  className?: string;
  style?: object;
}

/**
 * An image component that maintains aspect ratio and only takes
 * the vertical space needed to display the image (up to maxHeight).
 */
export function AspectImage({ 
  source, 
  maxHeight = 300, 
  maxWidth,
  className,
  style 
}: AspectImageProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Get the image dimensions from the asset source
    const resolved = Image.resolveAssetSource(source);
    if (resolved && resolved.width && resolved.height) {
      setImageSize({ width: resolved.width, height: resolved.height });
    }
  }, [source]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  // Calculate the display dimensions
  let displayWidth = containerWidth;
  let displayHeight = 0;

  if (imageSize.width > 0 && imageSize.height > 0 && containerWidth > 0) {
    const aspectRatio = imageSize.width / imageSize.height;
    
    // Apply maxWidth constraint if specified
    if (maxWidth && displayWidth > maxWidth) {
      displayWidth = maxWidth;
    }
    
    // Calculate height based on aspect ratio
    displayHeight = displayWidth / aspectRatio;
    
    // Apply maxHeight constraint
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * aspectRatio;
    }
  }

  return (
    <View 
      onLayout={onLayout} 
      style={[styles.container, style]}
      className={className}
    >
      {containerWidth > 0 && displayHeight > 0 && (
        <Image
          source={source}
          style={{
            width: displayWidth,
            height: displayHeight,
            alignSelf: 'center',
          }}
          resizeMode="contain"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
});
