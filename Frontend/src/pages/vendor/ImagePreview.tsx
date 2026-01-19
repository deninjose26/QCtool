import React, { useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { mockSources, mockLocations, mockRecordOwners, mockQCImages } from '@/lib/mock-data';
import { ChevronLeft, ChevronRight, Search, ZoomIn, ZoomOut } from 'lucide-react';

const VendorImagePreview: React.FC = () => {
    const [filters, setFilters] = useState({
        sourceId: '',
        locationId: '',
        recordOwnerId: '',
    });
    const [currentIndex, setCurrentIndex] = useState(0);
    const [zoom, setZoom] = useState(1);

    // Use mock images for preview
    const images = mockQCImages;

    const filteredLocations = filters.sourceId
        ? mockLocations.filter(l => l.sourceId === filters.sourceId)
        : [];

    const filteredRecordOwners = filters.locationId
        ? mockRecordOwners.filter(r => r.locationId === filters.locationId)
        : [];

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Vendor - Image Preview"
                description="Browse and preview your uploaded images"
            />

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="grid md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Source</Label>
                            <Select
                                value={filters.sourceId}
                                onValueChange={(v) => setFilters({ ...filters, sourceId: v, locationId: '', recordOwnerId: '' })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All sources" />
                                </SelectTrigger>
                                <SelectContent>
                                    {mockSources.map((source) => (
                                        <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Location</Label>
                            <Select
                                value={filters.locationId}
                                onValueChange={(v) => setFilters({ ...filters, locationId: v, recordOwnerId: '' })}
                                disabled={!filters.sourceId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All locations" />
                                </SelectTrigger>
                                <SelectContent>
                                    {filteredLocations.map((location) => (
                                        <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Record Owner</Label>
                            <Select
                                value={filters.recordOwnerId}
                                onValueChange={(v) => setFilters({ ...filters, recordOwnerId: v })}
                                disabled={!filters.locationId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All owners" />
                                </SelectTrigger>
                                <SelectContent>
                                    {filteredRecordOwners.map((owner) => (
                                        <SelectItem key={owner.id} value={owner.id}>{owner.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-end">
                            <Button className="gap-2 w-full">
                                <Search className="h-4 w-4" />
                                Search
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Image Viewer */}
            <div className="grid lg:grid-cols-4 gap-4">
                <div className="lg:col-span-3">
                    <Card className="overflow-hidden">
                        <div className="bg-muted/30 p-2 flex items-center justify-between border-b">
                            <span className="text-sm font-medium">
                                {images[currentIndex]?.imageName}
                            </span>
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>
                                    <ZoomOut className="h-4 w-4" />
                                </Button>
                                <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
                                <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>
                                    <ZoomIn className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <CardContent className="p-0 h-[500px] overflow-auto bg-muted/50 flex items-center justify-center">
                            <img
                                src={images[currentIndex]?.imageUrl}
                                alt={images[currentIndex]?.imageName}
                                className="max-w-full max-h-full object-contain transition-transform"
                                style={{ transform: `scale(${zoom})` }}
                            />
                        </CardContent>
                    </Card>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-4">
                        <Button
                            variant="outline"
                            onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                            disabled={currentIndex === 0}
                        >
                            <ChevronLeft className="h-4 w-4 mr-2" />
                            Previous
                        </Button>

                        <span className="text-sm text-muted-foreground">
                            Image {currentIndex + 1} of {images.length}
                        </span>

                        <Button
                            variant="outline"
                            onClick={() => setCurrentIndex(Math.min(images.length - 1, currentIndex + 1))}
                            disabled={currentIndex === images.length - 1}
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </div>

                {/* Thumbnails */}
                <div>
                    <Card>
                        <CardContent className="p-4">
                            <h3 className="font-semibold mb-3">Images ({images.length})</h3>
                            <div className="grid grid-cols-3 gap-2 max-h-[500px] overflow-y-auto">
                                {images.map((img, i) => (
                                    <button
                                        key={img.id}
                                        onClick={() => setCurrentIndex(i)}
                                        className={`relative aspect-square rounded overflow-hidden border-2 transition-all ${i === currentIndex
                                                ? 'border-primary ring-2 ring-primary/20'
                                                : 'border-transparent hover:border-muted-foreground/30'
                                            }`}
                                    >
                                        <img
                                            src={img.imageUrl}
                                            alt={img.imageName}
                                            className="w-full h-full object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default VendorImagePreview;
