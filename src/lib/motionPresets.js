/** Shared easing (matches existing shell transitions). */
export const MF_EASE = [0.22, 1, 0.36, 1]

export function transitionSec(seconds) {
    return { duration: seconds, ease: MF_EASE }
}

/** Full-page route cross-fade. */
export function routePresenceProps(reducedMotion) {
    if (reducedMotion) {
        return {
            initial: false,
            animate: { opacity: 1 },
            exit: { opacity: 1 },
        }
    }
    return {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: transitionSec(0.28) },
        exit: { opacity: 0, transition: transitionSec(0.18) },
    }
}

/** Single block: fade + slight rise. Optional delay (e.g. after hero stagger). */
export function fadeUpProps(reducedMotion, y = 14, delay = 0) {
    if (reducedMotion) {
        return {
            initial: false,
            animate: { opacity: 1 },
        }
    }
    return {
        initial: { opacity: 0, y },
        animate: { opacity: 1, y: 0, transition: { ...transitionSec(0.48), delay } },
    }
}

export function getStaggerContainer(reducedMotion, stagger = 0.085, delayChildren = 0.05) {
    if (reducedMotion) {
        return {
            initial: false,
            animate: 'visible',
            variants: {
                hidden: {},
                visible: {
                    transition: { staggerChildren: 0, delayChildren: 0 },
                },
            },
        }
    }
    return {
        initial: 'hidden',
        animate: 'visible',
        variants: {
            hidden: {},
            visible: {
                transition: { staggerChildren: stagger, delayChildren },
            },
        },
    }
}

export function getStaggerItem(reducedMotion, y = 12) {
    if (reducedMotion) {
        return {
            variants: {
                hidden: { opacity: 1, y: 0 },
                visible: { opacity: 1, y: 0 },
            },
        }
    }
    return {
        variants: {
            hidden: { opacity: 0, y },
            visible: {
                opacity: 1,
                y: 0,
                transition: transitionSec(0.42),
            },
        },
    }
}

/** Success / modal entrance (use with AnimatePresence for exit). */
export function popInProps(reducedMotion) {
    if (reducedMotion) {
        return {
            initial: false,
            animate: { opacity: 1 },
            exit: { opacity: 1 },
        }
    }
    return {
        initial: { opacity: 0, scale: 0.97, y: 10 },
        animate: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: transitionSec(0.4),
        },
        exit: {
            opacity: 0,
            scale: 0.98,
            y: -8,
            transition: transitionSec(0.2),
        },
    }
}

export const tapProps = (reducedMotion) =>
    reducedMotion ? {} : { whileTap: { scale: 0.98 } }

/** Nested stagger (e.g. grid of motion children). */
export function getNestedStaggerGrid(reducedMotion, stagger = 0.08) {
    if (reducedMotion) {
        return {
            variants: {
                hidden: {},
                visible: {},
            },
        }
    }
    return {
        variants: {
            hidden: {},
            visible: {
                transition: { staggerChildren: stagger, delayChildren: 0 },
            },
        },
    }
}
