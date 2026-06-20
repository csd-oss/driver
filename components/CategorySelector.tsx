import { useState } from 'react';
import { View, Modal, Pressable, ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { UIText } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { getCategories } from '@/src/lib/categories';
import { t } from '@/src/i18n/i18n';

interface CategorySelectorProps {
  lang: number;
  selectedCategory: string;
  onSelect: (categoryTxt: string | 'all') => void;
}

export const CategorySelector = ({ lang, selectedCategory, onSelect }: CategorySelectorProps) => {
  const [modalVisible, setModalVisible] = useState(false);
  const categories = getCategories(lang);
  
  const displayLabel = selectedCategory === 'all' 
    ? t('category.all', lang)
    : selectedCategory;

  const handleSelect = (category: string | 'all') => {
    onSelect(category);
    setModalVisible(false);
  };

  return (
    <>
      <PressableScale
        onPress={() => setModalVisible(true)}
        className="w-full"
        accessibilityRole="button"
        accessibilityLabel={`${t('category.select', lang)}: ${displayLabel}`}
        accessibilityHint="Opens category picker"
      >
        <Card className="p-3 bg-white dark:bg-slate-900">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <UIText variant="caption" className="text-slate-500 dark:text-slate-400 mb-1">
                {t('category.select', lang)}
              </UIText>
              <UIText variant="body" className="font-semibold">
                {displayLabel}
              </UIText>
            </View>
            <UIText variant="body" className="text-slate-500 dark:text-slate-400 ml-2">
              ▼
            </UIText>
          </View>
        </Card>
      </PressableScale>

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center px-4"
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-md"
          >
            <View className="max-h-[80%] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg p-4">
              <View className="mb-4">
                <UIText variant="subtitle" className="mb-2">
                  {t('category.select', lang)}
                </UIText>
              </View>
              
              <ScrollView className="max-h-96">
                <View className="gap-2">
                  {/* All option */}
                  <PressableScale
                    onPress={() => handleSelect('all')}
                    scaleTo={0.92}
                    className={`p-4 rounded-xl border min-h-[48px] justify-center ${
                      selectedCategory === 'all'
                        ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-700'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedCategory === 'all' }}
                    accessibilityLabel={t('category.all', lang)}
                  >
                    <UIText
                      variant="body"
                      className={selectedCategory === 'all' ? 'font-semibold text-indigo-700 dark:text-indigo-200' : ''}
                    >
                      {t('category.all', lang)}
                    </UIText>
                  </PressableScale>

                  {/* Category options */}
                  {categories.map((category, index) => (
                    <PressableScale
                      key={index}
                      onPress={() => handleSelect(category)}
                      scaleTo={0.92}
                      className={`p-4 rounded-xl border min-h-[48px] justify-center ${
                        selectedCategory === category
                          ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-700'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: selectedCategory === category }}
                      accessibilityLabel={category}
                    >
                      <UIText
                        variant="body"
                        className={selectedCategory === category ? 'font-semibold text-indigo-700 dark:text-indigo-200' : ''}
                      >
                        {category}
                      </UIText>
                    </PressableScale>
                  ))}
                </View>
              </ScrollView>

              <View className="mt-4">
                <Button
                  onPress={() => setModalVisible(false)}
                  variant="outline"
                  className="w-full"
                >
                  {t('nav.back', lang)}
                </Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};
