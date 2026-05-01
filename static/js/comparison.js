document.addEventListener('DOMContentLoaded', function() {
    // Get the query parameters from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('query');
    
    if (!query) {
        showError('No search query provided. Please return to the home page and try again.');
        return;
    }
    
    // Update the query display in the UI
    document.getElementById('query-display').textContent = query;
    
    // Show loading state
    document.getElementById('loading-indicator').style.display = 'flex';
    
    // Make the API call to the backend
    fetchComparisonData(query);
});

function fetchComparisonData(query) {
    fetch(`/compare-product?query=${encodeURIComponent(query)}`)
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Failed to fetch product data');
                });
            }
            return response.json();
        })
        .then(data => {
            // Hide loading indicator
            document.getElementById('loading-indicator').style.display = 'none';
            
            // Render the results
            renderResults(data);
        })
        .catch(error => {
            // Hide loading indicator
            document.getElementById('loading-indicator').style.display = 'none';
            
            // Show error message
            showError(`Error: ${error.message}`);
        });
}

function renderResults(data) {
    // Store the data in the original containers for reference
    const amazonContainer = document.getElementById('amazon-results');
    const flipkartContainer = document.getElementById('flipkart-results');
    const recommendationsContainer = document.getElementById('recommendations');
    
    // Clear previous results
    amazonContainer.innerHTML = '';
    flipkartContainer.innerHTML = '';
    recommendationsContainer.innerHTML = '';
    
    // Check if we have any products to display
    if ((!data.amazon || data.amazon.length === 0) && 
        (!data.flipkart || data.flipkart.length === 0)) {
        showError('No products found matching your search criteria.');
        return;
    }
    
    // Show results container
    document.getElementById('results-container').style.display = 'block';
    
    // Get the table body for our comparison table
    const tableBody = document.getElementById('comparison-table-body');
    tableBody.innerHTML = ''; // Clear previous results
    
    // Sort recommendations by similarity (matched products first)
    if (data.recommendations && data.recommendations.length > 0) {
        data.recommendations.sort((a, b) => b.similarity - a.similarity);
        
        // Render each recommendation as a row in the table
        data.recommendations.forEach((rec, index) => {
            const row = document.createElement('tr');
            
            // Product information cells
            let productName = '';
            let productImage = '';
            let amazonCell = '';
            let flipkartCell = '';
            let recommendationCell = '';
            
            // Determine product name and image
            if (rec.amazon_product) {
                productName = rec.amazon_product.name;
                productImage = rec.amazon_product.image_url;
            } else if (rec.flipkart_product) {
                productName = rec.flipkart_product.name;
                productImage = rec.flipkart_product.image_url;
                
                // Clean Flipkart product name
                const ratingsIndex = productName.indexOf('ratings &');
                if (ratingsIndex > -1) {
                    productName = productName.substring(0, ratingsIndex).trim();
                }
                
                // Remove numbers at the beginning like "1." or "2."
                productName = productName.replace(/^\d+\.\s*/g, '');
            }
            
            // If both platforms have the product, prefer Amazon image
            if (rec.amazon_product && rec.flipkart_product) {
                productImage = rec.amazon_product.image_url;
            }
            
            // Handle data:image/svg URLs
            if (!productImage || productImage.startsWith('data:image/svg+xml')) {
                productImage = 'https://via.placeholder.com/60x60?text=No+Image';
                console.log("Using placeholder for image in matched product:", productImage);
            }
            
            // Amazon cell content
            if (rec.amazon_product) {
                const amazonProduct = rec.amazon_product;
                // Parse rating to display in green box
                let amazonRating = amazonProduct.rating;
                if (amazonRating !== 'N/A') {
                    try {
                        amazonRating = parseFloat(amazonRating.split(' ')[0]);
                    } catch (e) {
                        amazonRating = 'N/A';
                    }
                }
                
                amazonCell = `
                    <div>
                        <div class="fw-bold">₹${amazonProduct.price}</div>
                        <div class="mt-2">
                            <span class="badge bg-success p-2">${amazonRating !== 'N/A' ? amazonRating + '★' : 'N/A'}</span>
                        </div>
                    </div>
                `;
            } else {
                amazonCell = '<span class="text-muted">Not available</span>';
            }
            
            // Flipkart cell content
            if (rec.flipkart_product) {
                const flipkartProduct = rec.flipkart_product;
                // Parse rating to display in green box
                let flipkartRating = flipkartProduct.rating;
                if (flipkartRating !== 'Rating not available') {
                    try {
                        flipkartRating = parseFloat(flipkartRating.split(' ')[0]);
                    } catch (e) {
                        flipkartRating = 'N/A';
                    }
                } else {
                    flipkartRating = 'N/A';
                }
                
                flipkartCell = `
                    <div>
                        <div class="fw-bold">${flipkartProduct.price}</div>
                        <div class="mt-2">
                            <span class="badge bg-success p-2">${flipkartRating !== 'N/A' ? flipkartRating + '★' : 'N/A'}</span>
                        </div>
                    </div>
                `;
            } else {
                flipkartCell = '<span class="text-muted">Not available</span>';
            }
            
            // Recommendation cell content
            if (rec.amazon_product && rec.flipkart_product) {
                const platform = rec.better_platform === 'amazon' ? 'Amazon' : 'Flipkart';
                const badgeClass = rec.better_platform === 'amazon' ? 'bg-info' : 'bg-warning';
                
                recommendationCell = `
                    <div class="badge ${badgeClass} p-2 w-100">
                        ${platform} <i class="bi bi-check-circle-fill ms-1"></i>
                    </div>
                    <div class="small mt-1">${rec.reason}</div>
                `;
            } else if (rec.amazon_product) {
                recommendationCell = `
                    <div class="badge bg-info p-2 w-100">
                        Amazon <i class="bi bi-check-circle-fill ms-1"></i>
                    </div>
                    <div class="small mt-1">Only available on Amazon</div>
                `;
            } else if (rec.flipkart_product) {
                recommendationCell = `
                    <div class="badge bg-warning p-2 w-100">
                        Flipkart <i class="bi bi-check-circle-fill ms-1"></i>
                    </div>
                    <div class="small mt-1">Only available on Flipkart</div>
                `;
            }
            
            // Encode product data for passing to visualization page
            console.log("Matched product data:", rec);
            const productData = encodeURIComponent(JSON.stringify(rec));
            
            // Build the complete row
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${productImage}" alt="${productName}" class="img-thumbnail me-2" style="width: 60px; height: 60px; object-fit: contain;">
                        <div class="product-name" style="max-width: 190px; overflow: hidden; text-overflow: ellipsis;">
                            ${productName}
                        </div>
                    </div>
                </td>
                <td>${amazonCell}</td>
                <td>${flipkartCell}</td>
                <td>${recommendationCell}</td>
                <td>
                    <a href="/visualization?product_data=${productData}" class="btn btn-sm btn-primary">
                        <i class="bi bi-graph-up"></i> Details
                    </a>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    } else {
        // If no recommendations, create individual rows for Amazon and Flipkart products
        let index = 1;
        
        if (data.amazon && data.amazon.length > 0) {
            data.amazon.forEach(product => {
                const row = document.createElement('tr');
                
                // Create a recommendation object for visualization
                const rec = {
                    amazon_product: product,
                    flipkart_product: null,
                    better_platform: 'amazon',
                    reason: 'Only available on Amazon',
                    similarity: 0
                };
                
                // Debug output to console
                console.log("Amazon product data:", rec);
                
                const productData = encodeURIComponent(JSON.stringify(rec));
                
                // Parse rating to display in green box
                let amazonRating = product.rating;
                if (amazonRating !== 'N/A') {
                    try {
                        amazonRating = parseFloat(amazonRating.split(' ')[0]);
                    } catch (e) {
                        amazonRating = 'N/A';
                    }
                }
                
                row.innerHTML = `
                    <td>${index++}</td>
                    <td>
                        <div class="d-flex align-items-center">
                            <img src="${product.image_url}" alt="${product.name}" class="img-thumbnail me-2" style="width: 60px; height: 60px; object-fit: contain;">
                            <div class="product-name" style="max-width: 190px; overflow: hidden; text-overflow: ellipsis;">
                                ${product.name}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div>
                            <div class="fw-bold">₹${product.price}</div>
                            <div class="mt-2">
                                <span class="badge bg-success p-2">${amazonRating !== 'N/A' ? amazonRating + '★' : 'N/A'}</span>
                            </div>
                        </div>
                    </td>
                    <td><span class="text-muted">Not available</span></td>
                    <td>
                        <div class="badge bg-info p-2 w-100">
                            Amazon <i class="bi bi-check-circle-fill ms-1"></i>
                        </div>
                        <div class="small mt-1">Only available on Amazon</div>
                    </td>
                    <td>
                        <a href="/visualization?product_data=${productData}" class="btn btn-sm btn-primary">
                            <i class="bi bi-graph-up"></i> Details
                        </a>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
        }
        
        if (data.flipkart && data.flipkart.length > 0) {
            data.flipkart.forEach(product => {
                const row = document.createElement('tr');
                
                // Create a recommendation object for visualization
                const rec = {
                    amazon_product: null,
                    flipkart_product: product,
                    better_platform: 'flipkart',
                    reason: 'Only available on Flipkart',
                    similarity: 0
                };
                
                // Debug output to console
                console.log("Flipkart product data:", rec);
                
                const productData = encodeURIComponent(JSON.stringify(rec));
                
                // Parse rating to display in green box
                let flipkartRating = product.rating;
                if (flipkartRating !== 'Rating not available') {
                    try {
                        flipkartRating = parseFloat(flipkartRating.split(' ')[0]);
                    } catch (e) {
                        flipkartRating = 'N/A';
                    }
                } else {
                    flipkartRating = 'N/A';
                }
                
                // Check if image URL is valid (not data:image/svg+xml)
                let imageUrl = product.image_url;
                if (!imageUrl || imageUrl.startsWith('data:image/svg+xml')) {
                    imageUrl = 'https://via.placeholder.com/60x60?text=No+Image';
                    console.log("Using placeholder for Flipkart image URL:", product.image_url);
                }
                
                // Clean Flipkart product name for display
                let displayName = product.name;
                
                // Remove everything after ratings text
                const ratingsIndex = displayName.indexOf('ratings &');
                if (ratingsIndex > -1) {
                    displayName = displayName.substring(0, ratingsIndex).trim();
                }
                
                // Remove numbers at the beginning like "1." or "2."
                displayName = displayName.replace(/^\d+\.\s*/g, '');
                
                row.innerHTML = `
                    <td>${index++}</td>
                    <td>
                        <div class="d-flex align-items-center">
                            <img src="${imageUrl}" alt="${displayName}" class="img-thumbnail me-2" style="width: 60px; height: 60px; object-fit: contain;">
                            <div class="product-name" style="max-width: 190px; overflow: hidden; text-overflow: ellipsis;">
                                ${displayName}
                            </div>
                        </div>
                    </td>
                    <td><span class="text-muted">Not available</span></td>
                    <td>
                        <div>
                            <div class="fw-bold">${product.price}</div>
                            <div class="mt-2">
                                <span class="badge bg-success p-2">${flipkartRating !== 'N/A' ? flipkartRating + '★' : 'N/A'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="badge bg-warning p-2 w-100">
                            Flipkart <i class="bi bi-check-circle-fill ms-1"></i>
                        </div>
                        <div class="small mt-1">Only available on Flipkart</div>
                    </td>
                    <td>
                        <a href="/visualization?product_data=${productData}" class="btn btn-sm btn-primary">
                            <i class="bi bi-graph-up"></i> Details
                        </a>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
        }
    }
}

function renderProductList(products, container, platform) {
    const productsList = document.createElement('div');
    productsList.className = 'row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4';
    
    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'col';
        
        productCard.innerHTML = `
            <div class="card h-100 product-card">
                <div class="card-img-container text-center p-2">
                    <img src="${product.image_url}" class="card-img-top product-image" alt="${product.name}">
                </div>
                <div class="card-body">
                    <h5 class="card-title product-title">${product.name}</h5>
                    <p class="card-text">
                        <span class="price">Price: ${platform === 'amazon' ? '₹' : ''}${product.price}</span><br>
                        <span class="rating">Rating: ${product.rating}</span>
                    </p>
                    <a href="${product.url}" target="_blank" class="btn btn-sm btn-primary">View on ${platform === 'amazon' ? 'Amazon' : 'Flipkart'}</a>
                </div>
            </div>
        `;
        
        productsList.appendChild(productCard);
    });
    
    container.appendChild(productsList);
}

function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.style.display = 'block';
    errorContainer.innerHTML = `
        <div class="alert alert-danger">
            ${message}
            <div class="mt-3">
                <a href="/" class="btn btn-primary">Return to Home</a>
            </div>
        </div>
    `;
}
