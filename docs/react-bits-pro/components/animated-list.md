npx shadcn@latest add @reactbits-starter/animated-list-tw

## Installation

npm install motion

## Usage

```
import AnimatedList, { AnimatedListItem } from "./animated-list";

// Define your items
const items: AnimatedListItem[] = [
  {
    id: 1,
    content: (
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-500" />
        <div>
          <p className="font-semibold">New notification</p>
          <p className="text-sm text-gray-400">Just now</p>
        </div>
      </div>
    ),
  },
  {
    id: 2,
    content: <p>Another notification</p>,
  },
];

// Basic usage - auto-adds items every 2 seconds
<AnimatedList items={items} />

// Different animation types
<AnimatedList items={items} animationType="slide" />
<AnimatedList items={items} animationType="fade" />
<AnimatedList items={items} animationType="scale" />
<AnimatedList items={items} animationType="bounce" />
<AnimatedList items={items} animationType="blur" />

// Control enter direction
<AnimatedList items={items} enterFrom="top" />
<AnimatedList items={items} enterFrom="bottom" />
<AnimatedList items={items} enterFrom="left" />
<AnimatedList items={items} enterFrom="right" />

// Hover and click effects
<AnimatedList
  items={items}
  hoverEffect="scale"
  clickEffect="ripple"
  onItemClick={(item) => console.log("Clicked:", item)}
/>

<AnimatedList
  items={items}
  clickEffect="press"
  onItemClick={(item) => console.log("Clicked:", item)}
/>

// Fade edges for smooth appearance at top/bottom
<AnimatedList
  items={items}
  fadeEdges={true}
  fadeEdgeSize={80}
  fadeColor="#0a0a0a"
/>

// Swipe to dismiss
<AnimatedList
  items={items}
  swipeToDismiss={true}
  onDismiss={(item) => console.log("Dismissed:", item)}
/>

// Pause on hover
<AnimatedList
  items={items}
  pauseOnHover={true}
/>

// Start position
<AnimatedList items={items} startFrom="top" />
<AnimatedList items={items} startFrom="center" />
<AnimatedList items={items} startFrom="bottom" />

// Custom timing and limits
<AnimatedList
  items={items}
  duration={0.5}
  autoAddDelay={3000}
  maxItems={10}
  itemGap={16}
  height="500px"
/>

// Disable auto-add (static list)
<AnimatedList
  items={items}
  autoAddDelay={0}
/>

// Custom render function
<AnimatedList
  items={items}
  renderItem={(item) => (
    <div className="flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-linear-to-br from-purple-500 to-pink-500" />
      <div className="flex-1">{item.content}</div>
    </div>
  )}
/>

// Full example with common options
<AnimatedList
  items={items}
  duration={0.4}
  autoAddDelay={2000}
  maxItems={10}
  startFrom="center"
  animationType="scale"
  enterFrom="top"
  pauseOnHover={true}
  hoverEffect="scale"
  clickEffect="ripple"
  fadeEdges={true}
  fadeEdgeSize={80}
  fadeColor="#0a0a0a"
  itemGap={12}
  onItemClick={(item) => console.log("Clicked:", item)}
  height="600px"
/>
```

## Code

```
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  PanInfo,
} from "motion/react";
import { cn } from "@/lib/utils";

export interface AnimatedListItem {
  /** Unique identifier for the item */
  id: string | number;
  /** Content to display */
  content: React.ReactNode;
}

export interface AnimatedListProps {
  /** Array of items to display */
  items: AnimatedListItem[];
  /** Duration of item animation in seconds */
  duration?: number;
  /** Animation easing function */
  easing?: [number, number, number, number];
  /** Delay between auto-adding items in ms (0 to disable auto-add) */
  autoAddDelay?: number;
  /** Maximum number of items to display */
  maxItems?: number;
  /** Vertical alignment of list items within container */
  startFrom?: "top" | "center" | "bottom";
  /** Type of entrance animation */
  animationType?: "slide" | "fade" | "scale" | "bounce" | "blur";
  /** Direction items enter from */
  enterFrom?: "top" | "bottom" | "left" | "right";
  /** Pause auto-adding when hovering over the list */
  pauseOnHover?: boolean;
  /** Hover effect for items */
  hoverEffect?: "none" | "scale";
  /** Click effect for items */
  clickEffect?: "none" | "ripple" | "press";
  /** Enable fade edges at top/bottom for smooth disappearing */
  fadeEdges?: boolean;
  /** Size of fade edges in pixels */
  fadeEdgeSize?: number;
  /** Background color for fade edges */
  fadeColor?: string;
  /** Enable swipe to dismiss items */
  swipeToDismiss?: boolean;
  /** Callback when an item is dismissed */
  onDismiss?: (item: AnimatedListItem) => void;
  /** Callback when an item is clicked */
  onItemClick?: (item: AnimatedListItem) => void;
  /** Gap between items in pixels */
  itemGap?: number;
  /** Additional CSS classes */
  className?: string;
  /** Custom item render function */
  renderItem?: (item: AnimatedListItem) => React.ReactNode;
  /** Height of the container */
  height?: string | number;
}

const Ripple: React.FC<{ x: number; y: number; onComplete: () => void }> = ({
  x,
  y,
  onComplete,
}) => {
  return (
    <motion.span
      className="absolute rounded-full bg-white/30 pointer-events-none"
      style={{ left: x, top: y, x: "-50%", y: "-50%" }}
      initial={{ width: 0, height: 0, opacity: 0.5 }}
      animate={{ width: 300, height: 300, opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      onAnimationComplete={onComplete}
    />
  );
};

const AnimatedListItemComponent: React.FC<{
  item: AnimatedListItem;
  itemRenderer: (item: AnimatedListItem) => React.ReactNode;
  hoverEffect: string;
  clickEffect: string;
  swipeToDismiss: boolean;
  onDismiss?: (item: AnimatedListItem) => void;
  onItemClick?: (item: AnimatedListItem) => void;
}> = ({
  item,
  itemRenderer,
  hoverEffect,
  clickEffect,
  swipeToDismiss,
  onDismiss,
  onItemClick,
}) => {
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number }[]
  >([]);
  const [isPressed, setIsPressed] = useState(false);
  const rippleIdRef = useRef(0);
  const itemRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const opacity = useTransform(x, [-150, 0, 150], [0, 1, 0]);
  const rotateZ = useTransform(x, [-150, 0, 150], [-10, 0, 10]);
  const swipeIndicatorOpacity = useTransform(
    x,
    [-100, -50, 50, 100],
    [1, 0, 0, 1],
  );

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (Math.abs(info.offset.x) > 100 && swipeToDismiss) {
      onDismiss?.(item);
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (clickEffect === "ripple" && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const rippleX = e.clientX - rect.left;
      const rippleY = e.clientY - rect.top;
      const id = rippleIdRef.current++;
      setRipples((prev) => [...prev, { id, x: rippleX, y: rippleY }]);
    }
    onItemClick?.(item);
  };

  const removeRipple = (id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <motion.div
      ref={itemRef}
      className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800",
        onItemClick && "cursor-pointer",
      )}
      drag={swipeToDismiss ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onMouseDown={() => clickEffect === "press" && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      animate={{
        scale: isPressed ? 0.97 : 1,
      }}
      whileHover={hoverEffect === "scale" ? { scale: 1.02 } : undefined}
      transition={{ duration: 0.15 }}
    >
      {/* Swipe indicator */}
      {swipeToDismiss && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: swipeIndicatorOpacity }}
        >
          <span className="text-red-500 font-semibold text-sm">Dismiss</span>
        </motion.div>
      )}

      {/* Main content */}
      <motion.div
        className="p-4"
        style={swipeToDismiss ? { x, opacity, rotateZ } : undefined}
      >
        {itemRenderer(item)}
      </motion.div>

      {/* Ripples */}
      {ripples.map((ripple) => (
        <Ripple
          key={ripple.id}
          x={ripple.x}
          y={ripple.y}
          onComplete={() => removeRipple(ripple.id)}
        />
      ))}
    </motion.div>
  );
};

const AnimatedList: React.FC<AnimatedListProps> = ({
  items: initialItems,
  duration = 0.4,
  easing = [0.25, 0.46, 0.45, 0.94],
  autoAddDelay = 2000,
  maxItems = 10,
  startFrom = "center",
  animationType = "slide",
  enterFrom = "top",
  pauseOnHover = false,
  hoverEffect = "none",
  clickEffect = "none",
  fadeEdges = true,
  fadeEdgeSize = 80,
  fadeColor,
  swipeToDismiss = false,
  onDismiss,
  onItemClick,
  itemGap = 12,
  className,
  renderItem,
  height = "600px",
}) => {
  const [items, setItems] = useState<AnimatedListItem[]>(() => initialItems);
  const itemIndexRef = useRef(initialItems.length);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (autoAddDelay <= 0 || initialItems.length === 0) {
      return;
    }

    intervalRef.current = setInterval(() => {
      if (isPaused) return;

      setItems((prevItems) => {
        const sourceItem =
          initialItems[itemIndexRef.current % initialItems.length];
        const newItem: AnimatedListItem = {
          id: `${sourceItem.id}-${itemIndexRef.current}`,
          content: sourceItem.content,
        };
        itemIndexRef.current++;

        const updatedItems = [newItem, ...prevItems];
        return updatedItems.slice(0, maxItems);
      });
    }, autoAddDelay);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoAddDelay, maxItems, initialItems, isPaused]);

  const handleDismiss = useCallback(
    (item: AnimatedListItem) => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onDismiss?.(item);
    },
    [onDismiss],
  );

  const defaultRenderItem = (item: AnimatedListItem) => (
    <div className="text-neutral-900 dark:text-white">{item.content}</div>
  );

  const itemRenderer = renderItem || defaultRenderItem;

  const getInitialAnimation = () => {
    const base: Record<string, number | string> = { height: 0, opacity: 0 };

    switch (enterFrom) {
      case "left":
        base.x = -50;
        break;
      case "right":
        base.x = 50;
        break;
      case "bottom":
        base.y = 30;
        break;
      case "top":
      default:
        base.y = -30;
        break;
    }

    switch (animationType) {
      case "scale":
        base.scale = 0.8;
        break;
      case "blur":
        base.filter = "blur(10px)";
        break;
    }

    return base;
  };

  const getAnimateState = () => {
    const base: Record<string, number | string> = {
      height: "auto",
      opacity: 1,
      x: 0,
      y: 0,
    };

    switch (animationType) {
      case "scale":
        base.scale = 1;
        break;
      case "blur":
        base.filter = "blur(0px)";
        break;
    }

    return base;
  };

  const getExitAnimation = () => {
    const base: Record<string, number | string> = {
      height: 0,
      opacity: 0,
      y: 20,
    };

    switch (animationType) {
      case "scale":
        base.scale = 0.8;
        break;
      case "blur":
        base.filter = "blur(10px)";
        break;
    }

    return base;
  };

  const getTransition = () => {
    const baseTransition = {
      duration,
      ease: easing,
    };

    if (animationType === "bounce") {
      return {
        ...baseTransition,
        type: "spring" as const,
        bounce: 0.4,
        stiffness: 300,
        damping: 20,
      };
    }

    return baseTransition;
  };

  const paddingClass =
    startFrom === "center"
      ? "pt-[50%]"
      : startFrom === "bottom"
        ? "pt-[100%]"
        : "";

  return (
    <div
      className={cn("w-full relative overflow-hidden", className)}
      style={{ height }}
    >
      {/* Fade edge overlays */}
      {fadeEdges && (
        <>
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none z-10"
            style={{
              height: fadeEdgeSize,
              background: `linear-gradient(to bottom, ${fadeColor || "var(--background, #0a0a0a)"} 0%, transparent 100%)`,
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
            style={{
              height: fadeEdgeSize,
              background: `linear-gradient(to top, ${fadeColor || "var(--background, #0a0a0a)"} 0%, transparent 100%)`,
            }}
          />
        </>
      )}

      <div
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide"
        onMouseEnter={() => pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => pauseOnHover && setIsPaused(false)}
      >
        <ul
          className={cn("p-4", paddingClass)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: `${itemGap}px`,
          }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item) => {
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={getInitialAnimation()}
                  animate={getAnimateState()}
                  exit={getExitAnimation()}
                  transition={getTransition()}
                  style={{
                    overflow: "visible",
                    willChange: "transform, opacity, height",
                  }}
                >
                  <AnimatedListItemComponent
                    item={item}
                    itemRenderer={itemRenderer}
                    hoverEffect={hoverEffect}
                    clickEffect={clickEffect}
                    swipeToDismiss={swipeToDismiss}
                    onDismiss={handleDismiss}
                    onItemClick={onItemClick}
                  />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>

      {/* Custom styles */}
      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default AnimatedList;

```


## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| items | AnimatedListItem\[\] | \[\] | Array of items to display with id and content |
| duration | number | 0.4 | Duration of item animation in seconds |
| easing | \[number, number, number, number\] | \[0.25, 0.46, 0.45, 0.94\] | Animation easing function as cubic bezier values |
| autoAddDelay | number | 2000 | Delay between auto-adding items in ms (0 to disable) |
| maxItems | number | 10 | Maximum number of items to display |
| startFrom | "top" \| "center" \| "bottom" | "center" | Starting position of list items |
| animationType | "slide" \| "fade" \| "scale" \| "bounce" \| "blur" | "slide" | Type of entrance animation for items |
| enterFrom | "top" \| "bottom" \| "left" \| "right" | "top" | Direction items enter from |
| pauseOnHover | boolean | false | Pause auto-adding when user hovers over the list |
| hoverEffect | "none" \| "scale" | "none" | Effect when hovering over items |
| clickEffect | "none" \| "ripple" \| "press" | "none" | Effect when clicking items |
| fadeEdges | boolean | true | Enable smooth fade at top/bottom edges |
| fadeEdgeSize | number | 80 | Size of fade edges in pixels |
| fadeColor | string | "#0a0a0a" | Background color for fade edges |
| swipeToDismiss | boolean | false | Enable swiping items to dismiss them |
| onDismiss | (item: AnimatedListItem) => void | undefined | Callback when an item is dismissed via swipe |
| onItemClick | (item: AnimatedListItem) => void | undefined | Callback function when an item is clicked |
| itemGap | number | 12 | Gap between items in pixels |
| className | string | "" | Additional CSS classes |
| renderItem | (item: AnimatedListItem) => ReactNode | undefined | Custom item render function |
| height | string \| number | "600px" | Height of the container |