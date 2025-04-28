// src/services/featureFlags.ts

import { flagsmith } from 'flagsmith';
import type { IState, IFlags } from 'flagsmith/types';
import { logger } from './logger';

// Define types for our feature flags
export interface DynaGenFeatureFlags {
  new_call_analyzer: boolean;
  enhanced_dashboard: boolean;
  beta_features: boolean;
  audio_processing_v2: boolean; 
  real_time_analytics: boolean;
  dark_mode: boolean;
}

// Define types for feature values that return non-boolean data
export interface DynaGenFeatureValues {
  max_call_duration_minutes: number;
  file_upload_limit_mb: number;
  refresh_interval_seconds: number;
}

// Set up a singleton state for flags across the application
let flagsmithInitialized = false;

/**
 * Initialize Flagsmith client with environment-specific configuration
 * Should be called once at application startup
 */
export const initFeatureFlags = async (): Promise<void> => {
  if (flagsmithInitialized) {
    logger.warn('Flagsmith already initialized. Skipping initialization.');
    return;
  }

  try {
    const environmentID = import.meta.env.VITE_FLAGSMITH_ENV_KEY;
    
    if (!environmentID) {
      throw new Error('Missing FLAGSMITH_ENV_KEY environment variable');
    }

    // Initialize with production-ready configuration
    await flagsmith.init({
      environmentID,
      cacheFlags: true,
      enableAnalytics: true,
      // Default reasonable values for local development
      defaultFlags: {
        new_call_analyzer: false,
        enhanced_dashboard: false,
        beta_features: false,
        audio_processing_v2: false,
        real_time_analytics: false,
        dark_mode: false,
        max_call_duration_minutes: 60,
        file_upload_limit_mb: 25,
        refresh_interval_seconds: 30
      },
      // Custom logging configuration
      logLevel: import.meta.env.DEV ? 'debug' : 'error',
      // Handle error cases gracefully
      onError: (error) => {
        logger.error('Flagsmith error:', error);
      },
      // React to flag changes in real-time
      onChange: (oldFlags: IFlags, newFlags: IFlags) => {
        logger.info('Feature flags updated', { 
          changes: Object.keys(newFlags).filter(key => 
            oldFlags[key] && oldFlags[key].value !== newFlags[key].value
          ) 
        });
        // Could broadcast flag changes to components via Event Bus
      },
      // Configure HTTP caching
      requestTimeoutMs: 3000,
      cache: {
        ttl: 60 // Cache for 1 minute
      }
    });

    flagsmithInitialized = true;
    logger.info('Feature flags initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize feature flags', error);
    // Continue with default values as fallback
    flagsmithInitialized = false;
  }
};

/**
 * Check if a feature flag is enabled
 * @param featureName The name of the feature flag to check
 * @param defaultValue Optional default value if flag doesn't exist (default: false)
 * @returns Boolean indicating if feature is enabled
 */
export const isFeatureEnabled = (
  featureName: keyof DynaGenFeatureFlags, 
  defaultValue = false
): boolean => {
  if (!flagsmithInitialized) {
    logger.warn(`Feature flag check for "${featureName}" before initialization. Using default: ${defaultValue}`);
    return defaultValue;
  }

  try {
    return flagsmith.hasFeature(featureName as string);
  } catch (error) {
    logger.error(`Error checking feature "${featureName}"`, error);
    return defaultValue;
  }
};

/**
 * Get a feature value (for non-boolean feature flags)
 * @param featureName The name of the feature value to retrieve
 * @param defaultValue Default value if flag doesn't exist or fails
 * @returns The feature value or default
 */
export const getFeatureValue = <T>(
  featureName: keyof DynaGenFeatureValues,
  defaultValue: T
): T => {
  if (!flagsmithInitialized) {
    logger.warn(`Feature value check for "${featureName}" before initialization. Using default.`);
    return defaultValue;
  }

  try {
    return flagsmith.getValue(featureName as string, defaultValue);
  } catch (error) {
    logger.error(`Error retrieving value for "${featureName}"`, error);
    return defaultValue;
  }
};

/**
 * Get all feature flags for a specific feature segment
 * Useful for grouping related features
 * @param segment Feature segment prefix (e.g., "audio_" will match "audio_processing_v2", etc.)
 * @returns Object containing all features in the segment
 */
export const getFeatureSegment = (segment: string): Record<string, boolean> => {
  if (!flagsmithInitialized) {
    logger.warn(`Feature segment "${segment}" requested before initialization. Returning empty object.`);
    return {};
  }

  try {
    const allFlags = flagsmith.getAllFlags();
    return Object.entries(allFlags)
      .filter(([key]) => key.startsWith(segment))
      .reduce((acc, [key, flag]) => {
        acc[key] = flag.enabled;
        return acc;
      }, {} as Record<string, boolean>);
  } catch (error) {
    logger.error(`Error retrieving feature segment "${segment}"`, error);
    return {};
  }
};

// Example usage to support user-specific features 
export const identifyUser = async (userId: string, userTraits?: Record<string, any>): Promise<void> => {
  if (!flagsmithInitialized) {
    logger.warn('Cannot identify user - Flagsmith not initialized');
    return;
  }

  try {
    await flagsmith.identify(userId, userTraits);
    logger.debug(`User identified in Flagsmith: ${userId}`);
  } catch (error) {
    logger.error('Error identifying user', error);
  }
};

// Utility to flush identification to support logout
export const clearUserIdentity = async (): Promise<void> => {
  if (!flagsmithInitialized) return;
  
  try {
    await flagsmith.logout();
    logger.debug('User identity cleared from Flagsmith');
  } catch (error) {
    logger.error('Error clearing user identity', error);
  }
};

// Lifecycle hook for cleanup
export const cleanupFeatureFlags = (): void => {
  // Nothing needed with current flagsmith implementation
  // Reserved for future cleanup needs
};

// Feature flag utilities for React components
/**
 * Creates a combined feature check for features that depend on multiple flags
 * @param features Array of feature names to check
 * @param operator 'AND' requires all features, 'OR' requires any feature
 * @returns Boolean indicating if the combined check passes
 */
export const combinedFeatureCheck = (
  features: Array<keyof DynaGenFeatureFlags>, 
  operator: 'AND' | 'OR' = 'AND'
): boolean => {
  if (features.length === 0) return false;
  
  if (operator === 'AND') {
    return features.every(feature => isFeatureEnabled(feature));
  } else {
    return features.some(feature => isFeatureEnabled(feature));
  }
};

// ---------------------------------------------------------------
// src/components/FeatureFlagProvider.tsx
// ---------------------------------------------------------------

import React, { useEffect, createContext, useContext, ReactNode } from 'react';
import { initFeatureFlags, isFeatureEnabled, getFeatureValue, identifyUser, clearUserIdentity, cleanupFeatureFlags } from '../services/featureFlags';
import type { DynaGenFeatureFlags, DynaGenFeatureValues } from '../services/featureFlags';
import { useAuth } from '../hooks/useAuth';

interface FeatureFlagContextType {
  isEnabled: <K extends keyof DynaGenFeatureFlags>(feature: K) => boolean;
  getValue: <K extends keyof DynaGenFeatureValues, T>(feature: K, defaultValue: T) => T;
  isInitialized: boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextType>({
  isEnabled: () => false,
  getValue: (_, defaultValue) => defaultValue,
  isInitialized: false
});

interface FeatureFlagProviderProps {
  children: ReactNode;
}

export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({ children }) => {
  const [initialized, setInitialized] = React.useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const initialize = async () => {
      await initFeatureFlags();
      setInitialized(true);
    };

    initialize();

    return () => {
      cleanupFeatureFlags();
    };
  }, []);

  // Identify user when they log in
  useEffect(() => {
    if (initialized && user) {
      identifyUser(user.id, {
        email: user.email,
        role: user.role,
        companySize: user.companySize,
        usageLevel: user.usageLevel
      });
    } else if (initialized && !user) {
      clearUserIdentity();
    }
  }, [initialized, user]);

  const contextValue: FeatureFlagContextType = {
    isEnabled: (feature) => isFeatureEnabled(feature),
    getValue: (feature, defaultValue) => getFeatureValue(feature, defaultValue),
    isInitialized: initialized
  };

  return (
    <FeatureFlagContext.Provider value={contextValue}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = () => useContext(FeatureFlagContext);

// ---------------------------------------------------------------
// Example Feature Flag Component Usage
// ---------------------------------------------------------------

// Feature-gated component
export const FeatureGated: React.FC<{
  feature: keyof DynaGenFeatureFlags;
  fallback?: React.ReactNode;
  children: ReactNode;
}> = ({ feature, fallback = null, children }) => {
  const { isEnabled, isInitialized } = useFeatureFlags();
  
  if (!isInitialized) {
    return null; // Or a skeleton/loading state
  }
  
  return isEnabled(feature) ? <>{children}</> : <>{fallback}</>;
};

// Usage example in a component
/*
function DashboardView() {
  const { isEnabled, getValue } = useFeatureFlags();
  const refreshInterval = getValue('refresh_interval_seconds', 60) * 1000;
  
  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Feature flag for entire section */}
      <FeatureGated feature="enhanced_dashboard">
        <EnhancedDashboardView />
      </FeatureGated>
      
      {/* Inline conditional rendering */}
      {isEnabled('real_time_analytics') && (
        <RealTimeMetricsPanel refreshRate={refreshInterval} />
      )}
      
      {/* Feature with fallback content */}
      <FeatureGated 
        feature="audio_processing_v2"
        fallback={<LegacyAudioProcessor />}
      >
        <EnhancedAudioProcessor />
      </FeatureGated>
    </div>
  );
}
*/

// ---------------------------------------------------------------
// Feature Flag Cleanup Script
// ---------------------------------------------------------------

// Script to be run periodically to avoid technical debt from obsolete flags

/*
// scripts/cleanup-feature-flags.js
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const flagsmith = require('flagsmith-node');

// Get flags from Flagsmith
const allFlags = await flagsmith.getEnvironmentFlags();
const flagsInUse = new Set(allFlags.map(flag => flag.name));

// Find all references to feature flags in codebase
const findFeatureReferences = async () => {
  const files = glob.sync('src/**/*.{ts,tsx,js,jsx}');
  const references = new Set();
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Extract all isFeatureEnabled() calls
    const matches = content.matchAll(/isEnabled\(['"]([\w_]+)['"]\)/g);
    for (const match of matches) {
      references.add(match[1]);
    }
    
    // Extract all feature names from FeatureGated components
    const gatedMatches = content.matchAll(/feature=["']([\w_]+)['"]/g);
    for (const match of gatedMatches) {
      references.add(match[1]);
    }
    
    // Extract getValue calls
    const valueMatches = content.matchAll(/getValue\(['"]([\w_]+)['"]/g);
    for (const match of valueMatches) {
      references.add(match[1]);
    }
  }
  
  return references;
};

const referencedFlags = await findFeatureReferences();

// Find unused flags
const unusedFlags = Array.from(flagsInUse).filter(flag => !referencedFlags.has(flag));

if (unusedFlags.length > 0) {
  console.log('The following flags exist in Flagsmith but are not referenced in the code:');
  unusedFlags.forEach(flag => console.log(` - ${flag}`));
  console.log('\nConsider removing these flags to reduce technical debt.');
} else {
  console.log('No unused feature flags found.');
}
*/
