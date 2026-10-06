import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';

const FlutedGlass = lazy(() => import('@paper-design/shaders-react').then((module) => ({ default: module.FlutedGlass })));
const HalftoneCmyk = lazy(() => import('@paper-design/shaders-react').then((module) => ({ default: module.HalftoneCmyk })));
const LiquidMetal = lazy(() => import('@paper-design/shaders-react').then((module) => ({ default: module.LiquidMetal })));
const MeshGradient = lazy(() => import('@paper-design/shaders-react').then((module) => ({ default: module.MeshGradient })));

export interface ShaderMediaProps {
  className?: string;
  image?: string;
  alt?: string;
  priority?: boolean;
  maxPixelCount?: number;
}

const useShaderState = (priority = false) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(priority);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(query.matches);
    const syncVisibility = () => setPageVisible(document.visibilityState === 'visible');
    syncMotion();
    syncVisibility();
    query.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      query.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (priority || !ref.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '160px' });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [priority]);

  return { ref, shouldRender: visible && pageVisible, reducedMotion };
};

const MediaFallback = ({ image, alt = '', className = '' }: ShaderMediaProps) => (
  <div className={`shader-fallback ${className}`}>
    {image ? <img src={image} alt={alt} className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-gradient-to-br from-slate-200 via-white to-brand-100" />}
  </div>
);

export const AfrogradFlutedMedia: React.FC<ShaderMediaProps> = ({ className = '', image, alt = '', priority, maxPixelCount = 1_300_000 }) => {
  const { ref, shouldRender } = useShaderState(priority);
  return (
    <div ref={ref} className={`shader-media ${className}`} role="img" aria-label={alt}>
      <MediaFallback image={image} alt="" className="absolute inset-0" />
      {shouldRender && image && (
        <Suspense fallback={null}>
          <FlutedGlass width="100%" height="100%" image={image} colorBack="#00000000" colorShadow="#000000" colorHighlight="#ffffff" size={0.5} shadows={0.25} highlights={0.1} shape="lines" angle={0} distortionShape="prism" distortion={0.5} shift={0} stretch={0} blur={0} edges={0.25} margin={0} grainMixer={0} grainOverlay={0} scale={1} fit="cover" maxPixelCount={maxPixelCount} />
        </Suspense>
      )}
    </div>
  );
};

export const AfrogradHalftoneMedia: React.FC<ShaderMediaProps> = ({ className = '', image, alt = '', priority, maxPixelCount = 1_100_000 }) => {
  const { ref, shouldRender } = useShaderState(priority);
  return (
    <div ref={ref} className={`shader-media ${className}`} role="img" aria-label={alt}>
      <MediaFallback image={image} alt="" className="absolute inset-0" />
      {shouldRender && image && (
        <Suspense fallback={null}>
          <HalftoneCmyk width="100%" height="100%" image={image} colorBack="#fbfaf4" colorC="#00b3ff" colorM="#fc4f9d" colorY="#ffd900" colorK="#231f20" size={0.2} gridNoise={0.2} type="ink" softness={1} contrast={1} floodC={0.15} floodM={0} floodY={0} floodK={0} gainC={0.3} gainM={0} gainY={0.2} gainK={0} grainMixer={0} grainOverlay={0} grainSize={0.5} scale={1} fit="cover" maxPixelCount={maxPixelCount} />
        </Suspense>
      )}
    </div>
  );
};

export const AfrogradAIFlowMark: React.FC<Omit<ShaderMediaProps, 'image' | 'alt'>> = ({ className = '', priority, maxPixelCount = 360_000 }) => {
  const { ref, shouldRender, reducedMotion } = useShaderState(priority);
  return (
    <div ref={ref} className={`shader-media overflow-hidden bg-surface-active ${className}`} aria-hidden="true">
      <span className="absolute inset-0 bg-gradient-to-br from-slate-300 via-white to-slate-400" />
      {shouldRender && (
        <Suspense fallback={null}>
          <LiquidMetal width="100%" height="100%" image="https://shaders.paper.design/images/logos/diamond.svg" colorBack="#aaaaac" colorTint="#ffffff" shape="circle" repetition={2} softness={0.1} shiftRed={0.3} shiftBlue={0.3} distortion={0.07} contour={0.4} angle={70} speed={reducedMotion ? 0 : 1} scale={0.6} fit="contain" maxPixelCount={maxPixelCount} />
        </Suspense>
      )}
    </div>
  );
};

export const AfrogradNatureBackdrop: React.FC<Omit<ShaderMediaProps, 'image' | 'alt'>> = ({ className = '', priority, maxPixelCount = 900_000 }) => {
  const { ref, shouldRender, reducedMotion } = useShaderState(priority);
  return (
    <div ref={ref} className={`shader-media overflow-hidden ${className}`} aria-hidden="true">
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#dce8d5,transparent_34%),radial-gradient(circle_at_80%_18%,#ffe0c8,transparent_30%),#f7f4ef]" />
      {shouldRender && (
        <Suspense fallback={null}>
          <MeshGradient width="100%" height="100%" colors={['#f7f4ef', '#d9e7cf', '#f4c98f', '#c8ddf5', '#fff4eb']} distortion={0.62} swirl={0.18} grainMixer={0.08} grainOverlay={0.04} speed={reducedMotion ? 0 : 0.16} scale={1.15} fit="cover" maxPixelCount={maxPixelCount} />
        </Suspense>
      )}
    </div>
  );
};
