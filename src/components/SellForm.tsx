'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { UploadCloud, CheckCircle2, Loader2 } from 'lucide-react'

// Placeholder server action
import { submitListing } from '@/app/sell/actions'

export default function SellForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  
  const [category, setCategory] = useState<string>('')
  const [images, setImages] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages(Array.from(e.target.files))
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsUploading(true)
    
    try {
      // 1. Submit the text data to get the Listing ID
      const formData = new FormData(e.currentTarget)
      
      // In a real app we'd get the listing ID back, but since Server Actions don't 
      // easily return data when redirecting, we'll construct the listing first.
      
      // This is MVP simplified logic. We'll upload images directly to a folder named by user id + timestamp
      const folderId = `${userId}/${Date.now()}`
      
      // 2. Upload Images
      const uploadedUrls = []
      for (let i = 0; i < images.length; i++) {
        const file = images[i]
        const fileExt = file.name.split('.').pop()
        const fileName = `${folderId}/${i}.${fileExt}`
        
        const { data, error } = await supabase.storage
          .from('listing_images')
          .upload(fileName, file)
          
        if (error) {
          console.error('Error uploading image:', error)
        } else {
          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('listing_images')
            .getPublicUrl(fileName)
            
          uploadedUrls.push(publicUrl)
        }
        setUploadProgress(Math.round(((i + 1) / images.length) * 100))
      }
      
      // We'll pass the URLs as a hidden field (JSON string) to the server action
      formData.append('image_urls', JSON.stringify(uploadedUrls))
      
      // 3. Submit the Server Action
      await submitListing(formData)
      
    } catch (err) {
      console.error(err)
      setIsUploading(false)
    }
  }

  const needsFlightData = ['complete', 'envelopes'].includes(category)
  const needsDimensions = ['baskets', 'burners'].includes(category)

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-card p-6 sm:p-8 rounded-2xl border shadow-sm">
      
      {/* SECTION 1: Category & Basics */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2">1. Equipment Basic Info</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Category *</label>
            <select 
              name="category" 
              required 
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background outline-none"
            >
              <option value="" disabled>Select a category...</option>
              <option value="complete">Complete Balloon</option>
              <option value="envelopes">Envelope Only</option>
              <option value="baskets">Basket</option>
              <option value="burners">Burner</option>
              <option value="accessories">Accessory / Other</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Condition *</label>
            <select name="condition" required className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background outline-none">
              <option value="New">New</option>
              <option value="Used-Excellent">Used - Excellent (Like New)</option>
              <option value="Used-Good">Used - Good (Normal Wear)</option>
              <option value="Needs Repair">Used - Needs Repair</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Listing Title *</label>
          <input 
            type="text" 
            name="title" 
            required 
            placeholder="e.g. Cameron Z-105 with Aristocrat Basket"
            className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Detailed Description *</label>
          <textarea 
            name="description" 
            required 
            rows={5}
            placeholder="Describe the condition, history, included extras..."
            className="w-full px-3 py-2 border rounded-lg bg-input/50 focus:bg-background outline-none resize-none"
          />
        </div>
      </div>

      {/* SECTION 2: Conditional Specifications */}
      {(category) && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-xl font-semibold border-b pb-2">2. Specifications</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {needsFlightData && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Manufacturer</label>
                  <input type="text" name="manufacturer" placeholder="e.g. Cameron Balloons" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Model / Volume</label>
                  <input type="text" name="model" placeholder="e.g. Z-105 / 105,000 cu ft" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Year of Manufacture</label>
                  <input type="number" name="year" placeholder="2018" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-primary">Total Hours Flown *</label>
                  <input type="number" name="hours" required placeholder="e.g. 145" className="w-full px-3 py-2 border border-primary/30 rounded-lg bg-input/50 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Registration</label>
                  <input type="text" name="registration" placeholder="e.g. G-XXXX" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Serial Number</label>
                  <input type="text" name="serial" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
                </div>
              </>
            )}

            {needsDimensions && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Dimensions</label>
                  <input type="text" name="dimensions" placeholder="e.g. 1.10 x 1.50m Solid Floor" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
                </div>
                {category === 'burners' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Burner Type</label>
                    <input type="text" name="type" placeholder="e.g. Shadow Double" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: Pricing & Contact */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2">3. Pricing & Location</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Price *</label>
            <input type="number" name="price" required min="0" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Currency *</label>
            <select name="currency" required defaultValue="EUR" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none">
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Location (Country) *</label>
            <input type="text" name="location_country" required placeholder="e.g. United Kingdom" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="space-y-2">
            <label className="text-sm font-medium">Contact Email *</label>
            <input type="email" name="contact_email" required placeholder="Your email for buyers" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
            <p className="text-xs text-muted-foreground">Hidden behind "Contact Seller" button.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Contact Phone</label>
            <input type="text" name="contact_phone" placeholder="Optional" className="w-full px-3 py-2 border rounded-lg bg-input/50 outline-none" />
          </div>
        </div>
      </div>

      {/* SECTION 4: Photos */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold border-b pb-2">4. Photos</h2>
        <div className="border-2 border-dashed border-border rounded-xl p-8 text-center flex flex-col items-center justify-center bg-muted/20">
          <UploadCloud className="w-10 h-10 text-muted-foreground mb-4" />
          <p className="text-sm font-medium mb-2">Drag and drop images here, or click to browse</p>
          <p className="text-xs text-muted-foreground mb-4">First image will be the cover photo. Max 5MB per file.</p>
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            onChange={handleImageChange}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
          {images.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto w-full py-2">
              {images.map((img, i) => (
                <div key={i} className="shrink-0 w-20 h-20 bg-slate-200 rounded-lg overflow-hidden relative">
                   {/* Normally rendering URL.createObjectURL(img) here, keeping it dry */}
                   <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-500 bg-slate-100">Image {i+1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SUBMISSION */}
      <div className="pt-6 border-t flex flex-col items-center gap-4">
        <label className="flex items-start gap-3 text-sm text-muted-foreground p-4 bg-muted/40 rounded-lg border">
          <input type="checkbox" required className="mt-1" />
          <span>I understand that AeroTrade does not intermediate this transaction and that upon payment of 5 EUR, my listing will be exclusively visible to Premium members for 48 hours before becoming public.</span>
        </label>
        
        <button 
          type="submit" 
          disabled={isUploading}
          className="w-full md:w-auto min-w-[300px] bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Uploading... {uploadProgress}%
            </>
          ) : (
            <>
              Pay 5 EUR & Publish Listing
              <CheckCircle2 className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

    </form>
  )
}
