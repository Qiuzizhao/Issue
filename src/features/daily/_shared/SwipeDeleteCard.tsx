import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable } from 'react-native';

import { SwipeActionCard } from '@/src/shared/motion';
import { colors } from '@/src/shared/theme';
import { styles } from './styles';

export function SwipeDeleteCard({
  children,
  onDelete,
  onSwipeActiveChange,
  secondaryAction,
  variant = 'card',
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onSwipeActiveChange?: (active: boolean) => void;
  secondaryAction?: React.ReactNode | ((close: () => void) => React.ReactNode);
  variant?: 'card' | 'list';
}) {
  const listVariant = variant === 'list';
  const actionWidth = secondaryAction ? 112 : 56;

  return (
    <SwipeActionCard
      action={({ close }) => (
        <>
          {typeof secondaryAction === 'function' ? secondaryAction(close) : secondaryAction}
          <Pressable style={({ pressed }) => [styles.swipeDeleteAction, listVariant && styles.swipeListDeleteAction, pressed && styles.swipeActionPressed]} onPress={onDelete}>
            <Ionicons name="trash-outline" size={20} color={colors.surface} />
          </Pressable>
        </>
      )}
      actionWidth={actionWidth}
      containerStyle={[styles.swipeCard, listVariant && styles.swipeListCard]}
      contentStyle={styles.swipeContent}
      railStyle={styles.swipeRail}
      onSwipeActiveChange={onSwipeActiveChange}
    >
      {children}
    </SwipeActionCard>
  );
}
