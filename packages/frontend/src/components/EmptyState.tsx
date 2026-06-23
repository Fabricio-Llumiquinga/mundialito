import React from 'react';
import { Card, CardContent, Button } from '@heroui/react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
}

export function EmptyState({ icon, title, description, ctaLabel, ctaHref, onCtaClick }: EmptyStateProps) {
  return (
    <Card className="bg-white rounded-lg border border-dashed border-gray-300">
      <CardContent className="p-10 text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <h3 className="font-display text-xl text-gray-900 uppercase tracking-wide mb-2">{title}</h3>
        <p className="text-base text-gray-500 max-w-md mx-auto mb-6">{description}</p>
        {ctaLabel && (ctaHref || onCtaClick) && (
          ctaHref ? (
            <a href={ctaHref}>
              <Button color="primary" className="h-12 text-base font-semibold px-8">
                {ctaLabel}
              </Button>
            </a>
          ) : (
            <Button
              onPress={onCtaClick}
              color="primary"
              className="h-12 text-base font-semibold px-8"
            >
              {ctaLabel}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
